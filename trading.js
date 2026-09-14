const $=id=>document.getElementById(id),bctx=$('brain').getContext('2d');
const STARTING_CAPITAL=20;
const state={running:true,speed:4,episode:1,step:0,price:100,cash:STARTING_CAPITAL,shares:0,equity:STARTING_CAPITAL,peak:STARTING_CAPITAL,reward:0,lastReward:0,vol:.016,regime:'CALM',bars:[],trades:[],halted:false,decision:{action:1,confidence:[.2,.6,.2],active:[]}};
const worker=new Worker('snn-worker.js'),actions=['BUY','HOLD','SELL'];let timer,brainNodes=[];

const chart=LightweightCharts.createChart($('market'),{
  autoSize:true,
  layout:{background:{type:'solid',color:'#0d1014'},textColor:'#7f868e',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:10,attributionLogo:false},
  grid:{vertLines:{color:'#1a1f24'},horzLines:{color:'#1a1f24'}},
  crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{color:'#66707a',labelBackgroundColor:'#20262c'},horzLine:{color:'#66707a',labelBackgroundColor:'#20262c'}},
  rightPriceScale:{borderColor:'#282e34',scaleMargins:{top:.1,bottom:.2}},
  timeScale:{borderColor:'#282e34',timeVisible:true,secondsVisible:false,rightOffset:4,barSpacing:7},
  localization:{priceFormatter:price=>'$'+price.toFixed(2)}
});
const candleSeries=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#c7ff3d',downColor:'#ff5f68',wickUpColor:'#9fcb3d',wickDownColor:'#d64f58',borderVisible:false,priceLineColor:'#c7ff3d',priceLineWidth:1,lastValueVisible:true});
const volumeSeries=chart.addSeries(LightweightCharts.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});
volumeSeries.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
const tradeMarkers=LightweightCharts.createSeriesMarkers(candleSeries,[]);

function seeded(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let rand=seeded(42);
function normal(){return Math.sqrt(-2*Math.log(Math.max(rand(),1e-9)))*Math.cos(2*Math.PI*rand())}
function reset(){
  state.episode++;state.step=0;state.price=100;state.cash=STARTING_CAPITAL;state.shares=0;state.equity=STARTING_CAPITAL;state.peak=STARTING_CAPITAL;state.reward=0;state.lastReward=0;state.halted=false;state.bars=[];state.trades=[];
  rand=seeded(state.episode*977);$('riskState').textContent='ARMED';$('riskState').style.color='';worker.postMessage({type:'init',seed:state.episode*977});
  for(let i=0;i<70;i++)marketStep(false);
  chart.timeScale().fitContent();log('New $20 fractional-share episode #'+state.episode);
}
function features(){const closes=state.bars.map(b=>b.close),n=closes.length,ret=k=>n>k?Math.tanh((closes[n-1]/closes[n-1-k]-1)*35):0;const mom=ret(8),short=ret(2),dd=1-state.equity/state.peak,pos=state.shares*state.price/state.equity;return[.5+short/2,.5+mom/2,Math.min(1,state.vol*20),Math.min(1,dd*20),Math.min(1,pos*2),.5+Math.sin(state.step/24)/2]}
function marketStep(decide=true){
  if(state.halted)return;state.step++;
  if(state.step%120===0){const r=rand();state.regime=r<.28?'BEAR':r<.62?'CALM':'BULL';$('regime').textContent=state.regime}
  const drift=state.regime==='BULL'?.00035:state.regime==='BEAR'?-.00038:.00005,sigma=state.vol/Math.sqrt(390),open=state.price,close=open*Math.exp(drift+sigma*normal()),spread=Math.abs(sigma*normal())*open;
  state.price=close;state.bars.push({time:1700000000+state.episode*100000+state.step*60,open,high:Math.max(open,close)+spread,low:Math.min(open,close)-spread,close,volume:Math.round(800+rand()*4200)});
  if(state.bars.length>180)state.bars.shift();
  const prev=state.equity;state.equity=state.cash+state.shares*close;state.peak=Math.max(state.peak,state.equity);const dd=(state.peak-state.equity)/state.peak;
  state.lastReward=(state.equity-prev)/STARTING_CAPITAL-dd*.015;state.reward+=state.lastReward;
  if(dd>=.05){liquidate('DRAWDOWN LIMIT');state.halted=true;$('riskState').textContent='HALTED';$('riskState').style.color='var(--red)';log('RISK GATE: drawdown limit reached')}
  if(decide)worker.postMessage({type:'step',features:features(),reward:state.lastReward});render();
}
function execute(action,confidence){
  if(state.halted)return;
  const current=state.equity?state.shares*state.price/state.equity:0,target=[.5,current,0][action];if(Math.abs(target-current)<.08)return;
  const targetShares=state.equity*target/state.price,deltaShares=+(targetShares-state.shares).toFixed(6);if(Math.abs(deltaShares)<.000001)return;
  const notional=Math.abs(deltaShares)*state.price,cost=notional*.0008;state.cash-=deltaShares*state.price+cost;state.shares=+(state.shares+deltaShares).toFixed(6);
  state.trades.push({time:state.bars.at(-1).time,action,price:state.price});log(actions[action]+' '+Math.abs(deltaShares).toFixed(4)+' shares @ $'+state.price.toFixed(2)+' · '+(confidence*100).toFixed(0)+'%');
}
function liquidate(reason){if(!state.shares)return;state.cash+=state.shares*state.price-Math.abs(state.shares)*state.price*.0008;log('SELL '+state.shares.toFixed(4)+' shares · '+reason);state.shares=0}
worker.onmessage=e=>{if(e.data.type==='ready'){$('engine').textContent=e.data.engine;brainNodes=Array.from({length:96},(_,i)=>({x:rand(),y:rand(),p:i}));return}state.decision=e.data;$('action').textContent=actions[e.data.action];$('spikeRate').textContent=(e.data.total*62.5).toFixed(0)+' spikes/s';['buyBar','holdBar','sellBar'].forEach((id,i)=>$(id).style.height=(8+e.data.confidence[i]*90)+'%');execute(e.data.action,e.data.confidence[e.data.action])};
function log(message){const p=document.createElement('p'),time=document.createElement('time');time.textContent=new Date().toISOString().slice(11,19);p.append(time,document.createTextNode(message));$('orders').prepend(p);while($('orders').children.length>18)$('orders').lastChild.remove()}
function resize(c,cx){const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);c.width=r.width*d;c.height=r.height*d;cx.setTransform(d,0,0,d,0,0)}
function drawMarket(){
  if(!state.bars.length)return;
  candleSeries.setData(state.bars);volumeSeries.setData(state.bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#c7ff3d33':'#ff5f6833'})));
  tradeMarkers.setMarkers(state.trades.slice(-30).map(t=>({time:t.time,position:t.action===0?'belowBar':'aboveBar',color:t.action===0?'#62d9ff':'#ffb84a',shape:t.action===0?'arrowUp':'arrowDown',text:t.action===0?'BUY':'SELL'})));
}
function drawBrain(){resize($('brain'),bctx);const {width:w,height:h}=$('brain').getBoundingClientRect();bctx.strokeStyle='#24313a';brainNodes.forEach((n,i)=>{const q=brainNodes[(i*13+17)%brainNodes.length];bctx.beginPath();bctx.moveTo(n.x*w,n.y*h);bctx.lineTo(q.x*w,q.y*h);bctx.stroke()});const active=new Set(state.decision.active.map(x=>x%96));brainNodes.forEach((n,i)=>{bctx.fillStyle=active.has(i)?'#c7ff3d':'#43606d';bctx.beginPath();bctx.arc(n.x*w,n.y*h,active.has(i)?2.5:1,0,7);bctx.fill()})}
function render(){
  state.equity=state.cash+state.shares*state.price;const dd=(state.peak-state.equity)/state.peak*100,pos=state.equity?state.shares*state.price/state.equity*100:0,pnl=state.equity-STARTING_CAPITAL;
  $('lastPrice').textContent='$'+state.price.toFixed(2);$('equity').textContent='$'+state.equity.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});$('pnl').textContent='P&L '+(pnl>=0?'+':'')+'$'+pnl.toFixed(2);$('drawdown').textContent=dd.toFixed(2)+'%';$('position').textContent=pos.toFixed(0)+'%';$('shares').textContent=state.shares.toFixed(4)+' shares';$('reward').textContent=state.reward.toFixed(3);$('episode').textContent=state.episode;$('step').textContent='STEP '+state.step+' / 480';$('ddProgress').value=dd;$('exposureProgress').value=Math.abs(pos);drawMarket();drawBrain();
}
function schedule(){clearInterval(timer);timer=setInterval(()=>{if(state.running)for(let i=0;i<state.speed;i++)marketStep()},220)}
$('toggle').onclick=()=>{state.running=!state.running;$('toggle').innerHTML=state.running?'Ⅱ&nbsp;&nbsp; PAUSE':'▶&nbsp;&nbsp; RESUME';$('runStatus').textContent=state.running?'PAPER TRAINING LIVE':'TRAINING PAUSED'};
$('reset').onclick=reset;$('speed').oninput=e=>{$('speedOut').textContent=(state.speed=+e.target.value)+'×'};$('volatility').onchange=e=>state.vol=+e.target.value;addEventListener('resize',drawBrain);reset();schedule();
