const N=384,INPUTS=24,OUTPUTS=Array.from({length:7},(_,i)=>N-7+i),DT=1,WEIGHT_MIN=.01,WEIGHT_MAX=.7,HOMEOSTATIC_BASELINE=.15,HOMEOSTATIC_LAMBDA=.0015;
let ptr,post,weight,v,current,refractory,spikes,lastSpikes,firedCount,policy,rng=mulberry32(381),eligible=[],learningUpdates=0,totalAbsDelta=0,decisions=0,controlMode=false;

function mulberry32(seed){return()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function resetState(seed){rng=mulberry32(seed);v.fill(-52);current.fill(0);refractory.fill(0);spikes.fill(0);lastSpikes.fill(0);firedCount.fill(0);policy.fill(0);eligible=[]}
function build(seed=381,control=false,stateSeed=seed){
  controlMode=control;rng=mulberry32(seed);const edges=Array.from({length:N},()=>[]);
  for(let i=0;i<N;i++){const degree=3+Math.floor(rng()*7);for(let k=0;k<degree;k++){const j=Math.floor(rng()*N);if(j!==i)edges[i].push([j,.08+Math.log1p(Math.floor(rng()*30))*.08])}}
  for(let o=0;o<OUTPUTS.length;o++)for(let i=48;i<N-7;i+=5+o)edges[i].push([OUTPUTS[o],.25]);
  ptr=new Uint32Array(N+1);for(let i=0;i<N;i++)ptr[i+1]=ptr[i]+edges[i].length;post=new Uint16Array(ptr[N]);weight=new Float32Array(ptr[N]);
  for(let i=0;i<N;i++)edges[i].forEach(([j,w],k)=>{post[ptr[i]+k]=j;weight[ptr[i]+k]=w});
  v=new Float32Array(N);current=new Float32Array(N);refractory=new Uint8Array(N);spikes=new Uint8Array(N);lastSpikes=new Uint8Array(N);firedCount=new Uint8Array(N);policy=new Float32Array(OUTPUTS.length);resetState(stateSeed);
  postMessage({type:'ready',engine:(controlMode?'LIF CONTROL (frozen random) · ':'LIF PROXY · ')+N+'N / '+post.length+'E',neurons:N,edges:post.length,learningUpdates,control:controlMode});
}
// P0 fix (auditoria, punto 1): la regla anterior aplicaba el MISMO delta de signo(reward)
// a todas las sinapsis elegibles, sin distinguir que presinapticas contribuyeron mas, y sin
// ningun termino de decaimiento -- eso permite que un par de sinapsis con una racha de suerte
// temprana escalen hasta el techo (0.7) y se queden ahi de forma permanente (runaway), lo cual
// no es aprendizaje, es sesgo de confirmacion estructural.
// Ahora: (a) el delta se pondera por cuantas veces disparo la neurona presinaptica en la
// ventana de 16 ticks (contribucion real, no binaria); (b) se anade decaimiento homeostatico
// hacia una linea base tras cada actualizacion, para que ninguna sinapsis pueda saturarse de
// forma irreversible solo por una racha de recompensas del mismo signo.
function learn(reward){
  if(controlMode)return; // modo control: topologia identica, pesos SIEMPRE congelados (baseline)
  if(!eligible.length||Math.abs(reward)<1e-9)return;
  const sign=Math.sign(reward),magnitude=Math.min(1,Math.abs(reward)),maxContribution=Math.max(1,...eligible.map(e=>e.contribution));
  for(const{edge,contribution}of eligible){const before=weight[edge],scaled=contribution/maxContribution,delta=sign*magnitude*.006*scaled;weight[edge]=Math.max(WEIGHT_MIN,Math.min(WEIGHT_MAX,before+delta));totalAbsDelta+=Math.abs(weight[edge]-before);learningUpdates++}
  for(let i=0;i<weight.length;i++)weight[i]+=(HOMEOSTATIC_BASELINE-weight[i])*HOMEOSTATIC_LAMBDA;
}
function snapshot(){postMessage({type:'checkpoint',weights:Array.from(weight),learningUpdates,totalAbsDelta,decisions,control:controlMode})}
function restore(data){if(data?.weights?.length!==weight.length)return;weight.set(data.weights);learningUpdates=data.learningUpdates||0;totalAbsDelta=data.totalAbsDelta||0;decisions=data.decisions||0;postMessage({type:'restored',learningUpdates})}
function step(features,reward=0,train=true,explore=true){
  if(train)learn(reward);const decayV=Math.exp(-DT/20),decayI=Math.exp(-DT/5),activeWindow=new Uint8Array(N);let total=0;policy.fill(0);firedCount.fill(0);
  for(let tick=0;tick<16;tick++){
    current.fill(0);for(let i=0;i<INPUTS;i++)if(rng()<Math.min(.95,Math.max(0,features[i%features.length]))*.42)lastSpikes[i]=1;
    for(let i=0;i<N;i++)if(lastSpikes[i])for(let e=ptr[i];e<ptr[i+1];e++)current[post[e]]+=weight[e];spikes.fill(0);
    for(let i=0;i<N;i++){if(refractory[i]){refractory[i]--;continue}v[i]=-52+(v[i]+52)*decayV+current[i]*7*decayI+(i<INPUTS?features[i%features.length]*5:0);if(v[i]>-45){spikes[i]=1;activeWindow[i]=1;firedCount[i]++;v[i]=-52;refractory[i]=2;total++}}
    lastSpikes.set(spikes);OUTPUTS.forEach((n,i)=>policy[i]+=spikes[n]);
  }
  const sum=policy.reduce((a,b)=>a+b,0)+.001,confidence=Array.from(policy,x=>(x+.01)/(sum+.03)),epsilon=controlMode?0:Math.max(.04,.18-decisions/10000);let action=confidence.indexOf(Math.max(...confidence));
  const explored=!controlMode&&explore&&rng()<epsilon;if(explored)action=Math.floor(rng()*OUTPUTS.length);decisions++;eligible=[];const output=OUTPUTS[action];
  if(!controlMode)for(let i=48;i<N-7;i++)if(activeWindow[i])for(let e=ptr[i];e<ptr[i+1];e++)if(post[e]===output)eligible.push({edge:e,contribution:firedCount[i]});
  postMessage({type:'step',action,confidence,total,explored,active:Array.from(spikes.entries()).filter(([,x])=>x).slice(0,40).map(([i])=>i),learningUpdates,meanDelta:learningUpdates?totalAbsDelta/learningUpdates:0,epsilon});
}
onmessage=e=>{const {type,seed,control,stateSeed,features,reward,train,explore,checkpoint}=e.data;if(type==='init')build(seed,control,stateSeed);else if(type==='reset')resetState(seed);else if(type==='step')step(features,reward,train,explore);else if(type==='terminal'){if(train)learn(reward);snapshot()}else if(type==='restore')restore(checkpoint)};
