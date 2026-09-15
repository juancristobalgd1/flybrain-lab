import{FAST_WEIGHT_DEFAULTS,createFastWeightMemory,fastWeightActionBias,homeVector,resetFastWeightMemory,updateFastWeight}from'./lib/fast-weight-memory.mjs';

const N=512,INPUTS=18,ACTIONS=6,STEPS=10;
let rng,ptr,post,weights,v,current,spikes,last,rates,readout,eligibility,fastMemory;
let lastAction=5,updates=0,totalDelta=0,decisions=0,fastWeightWrites=0,fastWeightDelta=0,fastWeightResets=0;
const random=seed=>()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};

function resetNeuralState(seed=381){
  rng=random(seed);v.fill(-52);current.fill(0);spikes.fill(0);last.fill(0);rates.fill(0);eligibility.fill(0);resetFastWeightMemory(fastMemory);lastAction=5;fastWeightResets++;
}

function build(seed=381){
  rng=random(seed);const edges=Array.from({length:N},()=>[]);
  for(let i=0;i<N;i++){const degree=5+Math.floor(rng()*7);for(let k=0;k<degree;k++){const j=Math.floor(rng()*N);if(i!==j)edges[i].push([j,.05+rng()*.24])}}
  ptr=new Uint32Array(N+1);for(let i=0;i<N;i++)ptr[i+1]=ptr[i]+edges[i].length;
  post=new Uint16Array(ptr[N]);weights=new Float32Array(ptr[N]);
  for(let i=0;i<N;i++)edges[i].forEach(([j,w],k)=>{post[ptr[i]+k]=j;weights[ptr[i]+k]=w});
  v=new Float32Array(N);current=new Float32Array(N);spikes=new Uint8Array(N);last=new Uint8Array(N);rates=new Uint8Array(N);readout=new Float32Array(ACTIONS*N);eligibility=new Float32Array(ACTIONS*N);fastMemory=createFastWeightMemory();
  for(let i=0;i<readout.length;i++)readout[i]=(rng()-.5)*.08;
  resetNeuralState(seed);
  postMessage({type:'ready',neurons:N,edges:post.length,fastWeight:{columns:fastMemory.length,decayTau:FAST_WEIGHT_DEFAULTS.decayTau,resets:fastWeightResets}});
}

function learn(reward,train){
  if(!train||Math.abs(reward)<1e-7)return;
  const scale=Math.max(-1,Math.min(1,reward))*.003;
  for(let i=0;i<N;i++){const index=lastAction*N+i,e=eligibility[index];if(!e)continue;const before=readout[index];readout[index]=Math.max(-.8,Math.min(.8,before+scale*e));totalDelta+=Math.abs(readout[index]-before);updates++}
}

function fastWeightTelemetry(update,bias,navigation){
  const home=homeVector(fastMemory);
  return{vectorX:update.x,vectorZ:update.z,homeX:home.x,homeZ:home.z,magnitude:home.magnitude,heading:home.heading,confidence:home.confidence,decay:update.decay,column:update.column,writeGate:update.writeGate,dopamine:navigation.dopamine||0,returnMode:Boolean(navigation.returnMode),used:bias.used,writes:fastWeightWrites,resets:fastWeightResets,meanDelta:fastWeightWrites?fastWeightDelta/fastWeightWrites:0};
}

function step(features,reward=0,train=true,teacher=5,navigation={}){
  learn(reward,train);
  const memoryUpdate=updateFastWeight(fastMemory,navigation);
  if(memoryUpdate.wrote){fastWeightWrites++;fastWeightDelta+=Math.abs(memoryUpdate.delta)}
  const memoryBias=fastWeightActionBias(fastMemory,{yaw:navigation.yaw,returnMode:navigation.returnMode,actions:ACTIONS,gain:navigation.memoryGain??.6});
  rates.fill(0);spikes.fill(0);
  for(let tick=0;tick<STEPS;tick++){
    current.fill(0);for(let i=0;i<INPUTS;i++)if(rng()<Math.max(.02,Math.min(.95,features[i%features.length]))*.35)last[i]=1;
    for(let i=0;i<N;i++)if(last[i])for(let edge=ptr[i];edge<ptr[i+1];edge++)current[post[edge]]+=weights[edge];
    spikes.fill(0);for(let i=0;i<N;i++){v[i]=-52+(v[i]+52)*.94+current[i]*8+(i<INPUTS?features[i]*4:0);if(v[i]>-45){spikes[i]=1;rates[i]++;v[i]=-52}}
    last.set(spikes);
  }
  const logits=new Float32Array(ACTIONS);for(let action=0;action<ACTIONS;action++)for(let i=INPUTS;i<N;i++)logits[action]+=readout[action*N+i]*rates[i];
  for(let action=0;action<ACTIONS;action++)logits[action]+=memoryBias.bias[action];
  const max=Math.max(...logits),probs=Array.from(logits,value=>Math.exp((value-max)*.35)),sum=probs.reduce((a,b)=>a+b,0);for(let i=0;i<ACTIONS;i++)probs[i]/=sum;
  let action=probs.indexOf(Math.max(...probs)),guided=false,epsilon=train?Math.max(.08,.42-decisions/9000):0;
  // Curriculum guidance keeps early missions solvable while the readout learns.
  // During return, the fast-weight vector contributes only as a bounded policy bias.
  const curriculum=train?Math.max(.18,.88-decisions/3000):0;
  if(train&&rng()<curriculum){action=teacher;guided=true}
  else if(train&&rng()<epsilon){action=rng()<.72?teacher:Math.floor(rng()*ACTIONS);guided=action===teacher}
  eligibility.fill(0);for(let i=INPUTS;i<N;i++)if(rates[i])eligibility[action*N+i]=rates[i]/STEPS;
  lastAction=action;decisions++;
  const active=[];for(let i=0;i<N&&active.length<55;i++)if(rates[i])active.push(i);
  postMessage({type:'decision',action,probs,spikes:rates.reduce((a,b)=>a+b,0),active,guided,memoryUsed:memoryBias.used,epsilon,updates,meanDelta:updates?totalDelta/updates:0,fastWeight:fastWeightTelemetry(memoryUpdate,memoryBias,navigation)});
}

function checkpoint(){postMessage({type:'checkpoint',data:{readout:Array.from(readout),updates,totalDelta,decisions}})}
function restore(data){if(data?.readout?.length!==readout.length)return;readout.set(data.readout);updates=data.updates||0;totalDelta=data.totalDelta||0;decisions=data.decisions||0;postMessage({type:'restored',updates})}
onmessage=({data})=>{if(data.type==='init')build(data.seed);else if(data.type==='reset')resetNeuralState(data.seed);else if(data.type==='step')step(data.features,data.reward,data.train,data.teacher,data.navigation||{});else if(data.type==='checkpoint')checkpoint();else if(data.type==='restore')restore(data.data)};
