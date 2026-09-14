const $=id=>document.getElementById(id),bctx=$('brain').getContext('2d'),STARTING_CAPITAL=20,HORIZON=480;
const ACTIONS=['BUY','HOLD','SELL'],COMMISSION_BPS=8,SPREAD_BPS=4,SLIPPAGE_BPS=2,MIN_HOLD=5,COOLDOWN=3,MAX_TRADES=24,persistedHistory=load('flybrain-history',[]);
const state={running:true,speed:4,episode:load('flybrain-episode',persistedHistory.at(-1)?.episode||0),step:0,price:100,cash:STARTING_CAPITAL,shares:0,equity:STARTING_CAPITAL,peak:STARTING_CAPITAL,reward:0,lastReward:0,vol:.016,maxDrawdown:.05,minConfidence:.65,regime:'CALM',phase:'TRAIN',bars:[],trades:[],history:persistedHistory,pending:null,holdingBars:0,cooldown:0,tradeCount:0,turnover:0,stepTurnover:0,ending:false,decision:{action:1,confidence:[.2,.6,.2],active:[]}};
const worker=new Worker('snn-worker.js?v=2');let timer,episodeTimer,brainNodes=[],workerInitialized=false;

const chart=LightweightCharts.createChart($('market'),{autoSize:true,layout:{background:{type:'solid',color:'#0d1014'},textColor:'#7f868e',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:10,attributionLogo:false},grid:{vertLines:{color:'#1a1f24'},horzLines:{color:'#1a1f24'}},crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{color:'#66707a',labelBackgroundColor:'#20262c'},horzLine:{color:'#66707a',labelBackgroundColor:'#20262c'}},rightPriceScale:{borderColor:'#282e34',scaleMargins:{top:.1,bottom:.2}},timeScale:{borderColor:'#282e34',timeVisible:true,secondsVisible:false,rightOffset:4,barSpacing:7},localization:{priceFormatter:price=>'$'+price.toFixed(2)}});
const candleSeries=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#c7ff3d',downColor:'#ff5f68',wickUpColor:'#9fcb3d',wickDownColor:'#d64f58',borderVisible:false,priceLineColor:'#c7ff3d',priceLineWidth:1,lastValueVisible:true});
const volumeSeries=chart.addSeries(LightweightCharts.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});
volumeSeries.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});const tradeMarkers=LightweightCharts.createSeriesMarkers(candleSeries,[]);

function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function seeded(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let rand=seeded(42);const normal=()=>Math.sqrt(-2*Math.log(Math.max(rand(),1e-9)))*Math.cos(2*Math.PI*rand());
const phaseFor=episode=>episode%10===0?'TEST':episode%10>=8?'VALIDATION':'TRAIN';
const pct=value=>(value*100).toFixed(2)+'%';

function reset(){
  clearTimeout(episodeTimer);state.episode++;save('flybrain-episode',state.episode);state.step=0;state.price=100;state.cash=STARTING_CAPITAL;state.shares=0;state.equity=STARTING_CAPITAL;state.peak=STARTING_CAPITAL;state.reward=0;state.lastReward=0;state.regime='CALM';state.phase=phaseFor(state.episode);state.bars=[];state.trades=[];state.pending=null;state.holdingBars=0;state.cooldown=0;state.tradeCount=0;state.turnover=0;state.ending=false;
  rand=seeded(state.episode*977);$('phase').textContent=state.phase;$('phase').style.color=state.phase==='TRAIN'?'var(--lime)':state.phase==='TEST'?'var(--red)':'var(--cyan)';$('riskState').textContent='ARMED';$('riskState').style.color='';
  worker.postMessage({type:workerInitialized?'reset':'init',seed:state.episode*977});workerInitialized=true;
  for(let i=0;i<70;i++)marketStep(false);chart.timeScale().fitContent();log(state.phase+' episode #'+state.episode+' · weights '+(state.phase==='TRAIN'?'trainable':'frozen'));
}
function features(){
  const closes=state.bars.map(b=>b.close),volumes=state.bars.map(b=>b.volume),n=closes.length,ret=k=>n>k?Math.tanh((closes[n-1]/closes[n-1-k]-1)*35):0;
  const recent=closes.slice(-12),mean=recent.reduce((a,b)=>a+b,0)/(recent.length||1),variance=recent.reduce((a,b)=>a+(b-mean)**2,0)/(recent.length||1),realizedVol=Math.min(1,Math.sqrt(variance)/(mean||1)*80),volumeRatio=n>10?Math.min(1,volumes.at(-1)/(volumes.slice(-10).reduce((a,b)=>a+b,0)/10)/2):.5,dd=1-state.equity/state.peak,pos=state.equity?state.shares*state.price/state.equity:0;
  return[.5+ret(1)/2,.5+ret(3)/2,.5+ret(12)/2,realizedVol,volumeRatio,Math.min(1,dd*20),Math.min(1,pos*2),state.cooldown?1:0];
}
function targetExposure(confidence){return confidence>=.8?.5:confidence>=.7?.25:.1}
function queueDecision(action,confidence){
  if(state.ending||confidence<state.minConfidence||action===1)return;
  if(action===0&&(state.cooldown||state.tradeCount>=MAX_TRADES))return;
  if(action===2&&state.shares>0&&state.holdingBars<MIN_HOLD)return;
  state.pending={action,target:action===0?targetExposure(confidence):0,confidence};
}
function executePending(open){
  state.stepTurnover=0;if(!state.pending)return;const {action,target,confidence}=state.pending;state.pending=null;
  const current=state.equity?state.shares*open/state.equity:0;if(Math.abs(target-current)<.025)return;
  const rawDelta=state.equity*target/open-state.shares,direction=Math.sign(rawDelta),fill=open*(1+direction*(SPREAD_BPS/2+SLIPPAGE_BPS)/10000),delta=+(state.equity*target/fill-state.shares).toFixed(6);
  if(Math.abs(delta)<.000001)return;const notional=Math.abs(delta)*fill,commission=notional*COMMISSION_BPS/10000;
  state.cash-=delta*fill+commission;state.shares=+(state.shares+delta).toFixed(6);state.stepTurnover=notional/STARTING_CAPITAL;state.turnover+=state.stepTurnover;state.tradeCount++;
  if(delta>0)state.holdingBars=0;else if(Math.abs(state.shares)<.000001){state.shares=0;state.cooldown=COOLDOWN}
  state.trades.push({time:state.bars.at(-1)?.time+60||0,action:delta>0?0:2,price:fill});log(ACTIONS[action]+' '+Math.abs(delta).toFixed(4)+' @ $'+fill.toFixed(2)+' · '+(confidence*100).toFixed(0)+'% · next-bar fill');
}
function marketStep(decide=true){
  if(state.ending)return;state.step++;const previousEquity=state.equity,previousDd=(state.peak-state.equity)/state.peak,open=state.price;executePending(open);
  if(state.step%120===0){const r=rand();state.regime=r<.3?'BEAR':r<.65?'CALM':'BULL';$('regime').textContent=state.regime}
  const drift=state.regime==='BULL'?.0003:state.regime==='BEAR'?-.00032:.00003,sigma=state.vol/Math.sqrt(390),close=open*Math.exp(drift+sigma*normal()),spread=Math.abs(sigma*normal())*open;
  state.price=close;state.bars.push({time:1700000000+state.episode*100000+state.step*60,open,high:Math.max(open,close)+spread,low:Math.min(open,close)-spread,close,volume:Math.round(800+rand()*4200)});if(state.bars.length>180)state.bars.shift();
  if(state.shares)state.holdingBars++;else if(state.cooldown)state.cooldown--;state.equity=state.cash+state.shares*close;state.peak=Math.max(state.peak,state.equity);
  const dd=(state.peak-state.equity)/state.peak,ddIncrease=Math.max(0,dd-previousDd);state.lastReward=(state.equity-previousEquity)/STARTING_CAPITAL-ddIncrease*.2-state.stepTurnover*.0002;state.reward+=state.lastReward;
  if(dd>=state.maxDrawdown){state.reward-=1;finishEpisode('MAX LOSS '+pct(state.maxDrawdown),-1);render();return}
  if(decide&&state.step>=HORIZON){const strategyReturn=state.equity/STARTING_CAPITAL-1,benchmarkReturn=close/100-1;finishEpisode('SESSION COMPLETE',Math.max(-1,Math.min(1,(strategyReturn-benchmarkReturn)*10)));render();return}
  if(decide)worker.postMessage({type:'step',features:features(),reward:state.lastReward,train:state.phase==='TRAIN',explore:state.phase==='TRAIN'});render();
}
function liquidate(reason){
  if(!state.shares)return;const fill=state.price*(1-(SPREAD_BPS/2+SLIPPAGE_BPS)/10000),notional=state.shares*fill,commission=notional*COMMISSION_BPS/10000;state.cash+=notional-commission;state.turnover+=notional/STARTING_CAPITAL;log('SELL '+state.shares.toFixed(4)+' · '+reason);state.shares=0;state.equity=state.cash;
}
function finishEpisode(reason,terminalReward){
  if(state.ending)return;state.ending=true;liquidate(reason);const strategyReturn=state.equity/STARTING_CAPITAL-1,benchmarkReturn=state.price/100-1;
  state.history.push({episode:state.episode,phase:state.phase,return:strategyReturn,benchmark:benchmarkReturn,reward:state.reward,trades:state.tradeCount,turnover:state.turnover,reason});state.history=state.history.slice(-500);save('flybrain-history',state.history);
  worker.postMessage({type:'terminal',reward:terminalReward,train:state.phase==='TRAIN'});$('riskState').textContent='RESETTING';$('riskState').style.color='var(--red)';log(reason+' · '+pct(strategyReturn)+' vs benchmark '+pct(benchmarkReturn));renderPerformance();episodeTimer=setTimeout(reset,650);
}
worker.onmessage=e=>{
  if(e.data.type==='ready'){const checkpoint=load('flybrain-checkpoint',null);$('engine').textContent=e.data.engine;brainNodes=Array.from({length:96},(_,i)=>({x:rand(),y:rand(),p:i}));if(checkpoint)worker.postMessage({type:'restore',checkpoint});return}
  if(e.data.type==='checkpoint'){save('flybrain-checkpoint',{weights:e.data.weights,learningUpdates:e.data.learningUpdates,totalAbsDelta:e.data.totalAbsDelta,decisions:e.data.decisions});return}
  if(e.data.type==='restored'){$('updates').textContent=e.data.learningUpdates.toLocaleString();log('Neural checkpoint restored');return}
  state.decision=e.data;$('action').textContent=ACTIONS[e.data.action];$('spikeRate').textContent=(e.data.total*62.5).toFixed(0)+' spikes/s';$('updates').textContent=e.data.learningUpdates.toLocaleString();$('weightDelta').textContent='ΔW '+e.data.meanDelta.toFixed(5)+' · ε '+(state.phase==='TRAIN'?(e.data.epsilon*100).toFixed(0)+'%':'OFF');['buyBar','holdBar','sellBar'].forEach((id,i)=>$(id).style.height=(8+e.data.confidence[i]*90)+'%');queueDecision(e.data.action,e.data.confidence[e.data.action]);
};
function log(message){const p=document.createElement('p'),time=document.createElement('time');time.textContent=new Date().toISOString().slice(11,19);p.append(time,document.createTextNode(message));$('orders').prepend(p);while($('orders').children.length>18)$('orders').lastChild.remove()}
function resize(c,cx){const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);c.width=r.width*d;c.height=r.height*d;cx.setTransform(d,0,0,d,0,0)}
function drawMarket(){if(!state.bars.length)return;candleSeries.setData(state.bars);volumeSeries.setData(state.bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#c7ff3d33':'#ff5f6833'})));tradeMarkers.setMarkers(state.trades.slice(-30).map(t=>({time:t.time,position:t.action===0?'belowBar':'aboveBar',color:t.action===0?'#62d9ff':'#ffb84a',shape:t.action===0?'arrowUp':'arrowDown',text:t.action===0?'BUY':'SELL'})))}
function drawBrain(){resize($('brain'),bctx);const {width:w,height:h}=$('brain').getBoundingClientRect();bctx.strokeStyle='#24313a';brainNodes.forEach((n,i)=>{const q=brainNodes[(i*13+17)%brainNodes.length];bctx.beginPath();bctx.moveTo(n.x*w,n.y*h);bctx.lineTo(q.x*w,q.y*h);bctx.stroke()});const active=new Set(state.decision.active.map(x=>x%96));brainNodes.forEach((n,i)=>{bctx.fillStyle=active.has(i)?'#c7ff3d':'#43606d';bctx.beginPath();bctx.arc(n.x*w,n.y*h,active.has(i)?2.5:1,0,7);bctx.fill()})}
function renderPerformance(){
  const h=state.history,wins=h.filter(x=>x.return>0),losses=h.filter(x=>x.return<0),avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0,profit=wins.reduce((a,x)=>a+x.return,0),loss=Math.abs(losses.reduce((a,x)=>a+x.return,0));
  $('completed').textContent=h.length;$('winRate').textContent=h.length?pct(wins.length/h.length):'—';$('avgReturn').textContent=h.length?pct(avg(h.map(x=>x.return))):'—';$('alpha').textContent=h.length?pct(avg(h.map(x=>x.return-x.benchmark))):'—';$('profitFactor').textContent=loss?(profit/loss).toFixed(2):profit?'∞':'—';$('turnover').textContent=state.turnover.toFixed(1)+'×';
}
function render(){state.equity=state.cash+state.shares*state.price;const dd=(state.peak-state.equity)/state.peak*100,pos=state.equity?state.shares*state.price/state.equity*100:0,pnl=state.equity-STARTING_CAPITAL;$('lastPrice').textContent='$'+state.price.toFixed(2);$('equity').textContent='$'+state.equity.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});$('pnl').textContent='P&L '+(pnl>=0?'+':'')+'$'+pnl.toFixed(2);$('drawdown').textContent=dd.toFixed(2)+'%';$('position').textContent=pos.toFixed(0)+'%';$('shares').textContent=state.shares.toFixed(4)+' shares';$('reward').textContent=state.reward.toFixed(3);$('episode').textContent=state.episode;$('step').textContent='STEP '+state.step+' / '+HORIZON;$('ddProgress').value=dd;$('exposureProgress').value=Math.abs(pos);drawMarket();drawBrain();renderPerformance()}
function schedule(){clearInterval(timer);timer=setInterval(()=>{if(state.running)for(let i=0;i<state.speed;i++)marketStep()},220)}
$('toggle').onclick=()=>{state.running=!state.running;$('toggle').innerHTML=state.running?'Ⅱ&nbsp;&nbsp; PAUSE':'▶&nbsp;&nbsp; RESUME';$('runStatus').textContent=state.running?'PAPER TRAINING LIVE':'TRAINING PAUSED'};
$('reset').onclick=()=>finishEpisode('MANUAL RESET',0);$('speed').oninput=e=>{$('speedOut').textContent=(state.speed=+e.target.value)+'×'};$('volatility').onchange=e=>state.vol=+e.target.value;
$('drawdownLimit').oninput=e=>{const value=+e.target.value;state.maxDrawdown=value/100;$('drawdownOut').textContent=value+'%';$('drawdownValue').textContent=value.toFixed(2)+'%';$('drawdownCaption').textContent='HARD LIMIT '+value.toFixed(2)+'%';$('ddProgress').max=value};
$('confidenceLimit').oninput=e=>{$('confidenceOut').textContent=e.target.value+'%';state.minConfidence=+e.target.value/100};addEventListener('resize',drawBrain);reset();schedule();
