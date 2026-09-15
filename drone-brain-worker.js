const N=512,INPUTS=18,ACTIONS=6,STEPS=10;
let rng,ptr,post,weights,v,spikes,last,readout,eligibility,lastAction=5,updates=0,totalDelta=0,decisions=0;
const random=seed=>()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};

function build(seed=381){
  rng=random(seed);const edges=Array.from({length:N},()=>[]);
  for(let i=0;i<N;i++){const degree=5+Math.floor(rng()*7);for(let k=0;k<degree;k++){const j=Math.floor(rng()*N);if(i!==j)edges[i].push([j,.05+rng()*.24])}}
  ptr=new Uint32Array(N+1);for(let i=0;i<N;i++)ptr[i+1]=ptr[i]+edges[i].length;
  post=new Uint16Array(ptr[N]);weights=new Float32Array(ptr[N]);
  for(let i=0;i<N;i++)edges[i].forEach(([j,w],k)=>{post[ptr[i]+k]=j;weights[ptr[i]+k]=w});
  v=new Float32Array(N).fill(-52);spikes=new Uint8Array(N);last=new Uint8Array(N);readout=new Float32Array(ACTIONS*N);eligibility=new Float32Array(ACTIONS*N);
  for(let i=0;i<readout.length;i++)readout[i]=(rng()-.5)*.08;
  postMessage({type:'ready',neurons:N,edges:post.length});
}

function learn(reward,train){
  if(!train||Math.abs(reward)<1e-7)return;
  const scale=Math.max(-1,Math.min(1,reward))*.003;
  for(let i=0;i<N;i++){const e=eligibility[lastAction*N+i];if(!e)continue;const idx=lastAction*N+i,before=readout[idx];readout[idx]=Math.max(-.8,Math.min(.8,before+scale*e));totalDelta+=Math.abs(readout[idx]-before);updates++}
}

function step(features,reward=0,train=true,teacher=5){
  learn(reward,train);const rates=new Uint8Array(N),current=new Float32Array(N);spikes.fill(0);
  for(let tick=0;tick<STEPS;tick++){
    current.fill(0);for(let i=0;i<INPUTS;i++)if(rng()<Math.max(.02,Math.min(.95,features[i]))*.35)last[i]=1;
    for(let i=0;i<N;i++)if(last[i])for(let e=ptr[i];e<ptr[i+1];e++)current[post[e]]+=weights[e];
    spikes.fill(0);for(let i=0;i<N;i++){v[i]=-52+(v[i]+52)*.94+current[i]*8+(i<INPUTS?features[i]*4:0);if(v[i]>-45){spikes[i]=1;rates[i]++;v[i]=-52}}
    last.set(spikes);
  }
  const logits=new Float32Array(ACTIONS);for(let a=0;a<ACTIONS;a++)for(let i=INPUTS;i<N;i++)logits[a]+=readout[a*N+i]*rates[i];
  const max=Math.max(...logits),probs=Array.from(logits,x=>Math.exp((x-max)*.35)),sum=probs.reduce((a,b)=>a+b,0);for(let i=0;i<ACTIONS;i++)probs[i]/=sum;
  let action=probs.indexOf(Math.max(...probs)),guided=false,epsilon=train?Math.max(.08,.42-decisions/9000):0;
  // Curriculum guidance keeps early missions solvable while the readout learns.
  // It decays to a small floor, so later behavior is increasingly produced by the SNN.
  const curriculum=train?Math.max(.18,.88-decisions/3000):0;
  if(train&&rng()<curriculum){action=teacher;guided=true}
  else if(train&&rng()<epsilon){action=rng()<.72?teacher:Math.floor(rng()*ACTIONS);guided=action===teacher}
  eligibility.fill(0);for(let i=INPUTS;i<N;i++)if(rates[i])eligibility[action*N+i]=rates[i]/STEPS;
  lastAction=action;decisions++;
  const active=[];for(let i=0;i<N&&active.length<55;i++)if(rates[i])active.push(i);
  postMessage({type:'decision',action,probs,spikes:rates.reduce((a,b)=>a+b,0),active,guided,epsilon,updates,meanDelta:updates?totalDelta/updates:0});
}

function checkpoint(){postMessage({type:'checkpoint',data:{readout:Array.from(readout),updates,totalDelta,decisions}})}
function restore(data){if(data?.readout?.length!==readout.length)return;readout.set(data.readout);updates=data.updates||0;totalDelta=data.totalDelta||0;decisions=data.decisions||0;postMessage({type:'restored',updates})}
onmessage=({data})=>{if(data.type==='init')build(data.seed);else if(data.type==='step')step(data.features,data.reward,data.train,data.teacher);else if(data.type==='checkpoint')checkpoint();else if(data.type==='restore')restore(data.data)};
