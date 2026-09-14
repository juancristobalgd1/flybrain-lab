const N=384,INPUTS=24,OUTPUTS=[N-3,N-2,N-1],DT=1;
let ptr,post,weight,v,current,refractory,spikes,lastSpikes,policy,rng=mulberry32(381),eligible=[],learningUpdates=0,totalAbsDelta=0,decisions=0;

function mulberry32(seed){return()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function resetState(seed){rng=mulberry32(seed);v.fill(-52);current.fill(0);refractory.fill(0);spikes.fill(0);lastSpikes.fill(0);policy.fill(0);eligible=[]}
function build(seed=381){
  rng=mulberry32(seed);const edges=Array.from({length:N},()=>[]);
  for(let i=0;i<N;i++){const degree=3+Math.floor(rng()*7);for(let k=0;k<degree;k++){const j=Math.floor(rng()*N);if(j!==i)edges[i].push([j,.08+Math.log1p(Math.floor(rng()*30))*.08])}}
  for(let o=0;o<OUTPUTS.length;o++)for(let i=48;i<N-3;i+=7+o)edges[i].push([OUTPUTS[o],.25]);
  ptr=new Uint32Array(N+1);for(let i=0;i<N;i++)ptr[i+1]=ptr[i]+edges[i].length;post=new Uint16Array(ptr[N]);weight=new Float32Array(ptr[N]);
  for(let i=0;i<N;i++)edges[i].forEach(([j,w],k)=>{post[ptr[i]+k]=j;weight[ptr[i]+k]=w});
  v=new Float32Array(N);current=new Float32Array(N);refractory=new Uint8Array(N);spikes=new Uint8Array(N);lastSpikes=new Uint8Array(N);policy=new Float32Array(OUTPUTS.length);resetState(seed);
  postMessage({type:'ready',engine:'LIF PROXY · '+N+'N / '+post.length+'E',neurons:N,edges:post.length,learningUpdates});
}
function learn(reward){
  if(!eligible.length||Math.abs(reward)<1e-9)return;
  const delta=Math.sign(reward)*Math.min(.004,.0002+Math.abs(reward)*.01);
  for(const edge of eligible){const before=weight[edge];weight[edge]=Math.max(.01,Math.min(.7,before+delta));totalAbsDelta+=Math.abs(weight[edge]-before);learningUpdates++}
}
function snapshot(){postMessage({type:'checkpoint',weights:Array.from(weight),learningUpdates,totalAbsDelta,decisions})}
function restore(data){if(data?.weights?.length!==weight.length)return;weight.set(data.weights);learningUpdates=data.learningUpdates||0;totalAbsDelta=data.totalAbsDelta||0;decisions=data.decisions||0;postMessage({type:'restored',learningUpdates})}
function step(features,reward=0,train=true,explore=true){
  if(train)learn(reward);const decayV=Math.exp(-DT/20),decayI=Math.exp(-DT/5),activeWindow=new Uint8Array(N);let total=0;policy.fill(0);
  for(let tick=0;tick<16;tick++){
    current.fill(0);for(let i=0;i<INPUTS;i++)if(rng()<Math.min(.95,Math.max(0,features[i%features.length]))*.42)lastSpikes[i]=1;
    for(let i=0;i<N;i++)if(lastSpikes[i])for(let e=ptr[i];e<ptr[i+1];e++)current[post[e]]+=weight[e];spikes.fill(0);
    for(let i=0;i<N;i++){if(refractory[i]){refractory[i]--;continue}v[i]=-52+(v[i]+52)*decayV+current[i]*7*decayI+(i<INPUTS?features[i%features.length]*5:0);if(v[i]>-45){spikes[i]=1;activeWindow[i]=1;v[i]=-52;refractory[i]=2;total++}}
    lastSpikes.set(spikes);OUTPUTS.forEach((n,i)=>policy[i]+=spikes[n]);
  }
  const sum=policy.reduce((a,b)=>a+b,0)+.001,confidence=Array.from(policy,x=>(x+.01)/(sum+.03)),epsilon=Math.max(.04,.18-decisions/10000);let action=confidence.indexOf(Math.max(...confidence));
  if(explore&&rng()<epsilon)action=Math.floor(rng()*3);decisions++;eligible=[];const output=OUTPUTS[action];
  for(let i=48;i<N-3;i++)if(activeWindow[i])for(let e=ptr[i];e<ptr[i+1];e++)if(post[e]===output)eligible.push(e);
  postMessage({type:'step',action,confidence,total,active:Array.from(spikes.entries()).filter(([,x])=>x).slice(0,40).map(([i])=>i),learningUpdates,meanDelta:learningUpdates?totalAbsDelta/learningUpdates:0,epsilon});
}
onmessage=e=>{const {type,seed,features,reward,train,explore,checkpoint}=e.data;if(type==='init')build(seed);else if(type==='reset')resetState(seed);else if(type==='step')step(features,reward,train,explore);else if(type==='terminal'){if(train)learn(reward);snapshot()}else if(type==='restore')restore(checkpoint)};
