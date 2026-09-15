// Memoria direccional de una misión. Es una aproximación computacional del
// almacenamiento rápido de vectores descrito para los circuitos hΔ; no es una
// afirmación de que estas sinapsis estén biológicamente validadas.
export const FAST_WEIGHT_COLUMNS=8;
export const FAST_WEIGHT_DEFAULTS=Object.freeze({learningRate:.42,decayTau:18,maxWeight:4,minSpeed:.03});

const TAU_EPS=1e-6;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function wrapAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle))}

export function directionColumn(angle,columns=FAST_WEIGHT_COLUMNS){
  const size=Math.max(2,Math.trunc(columns));
  const step=Math.PI*2/size;
  return ((Math.floor((wrapAngle(finite(angle))+Math.PI)/step+.5)%size)+size)%size;
}

export function createFastWeightMemory(columns=FAST_WEIGHT_COLUMNS){
  const size=Math.trunc(columns);
  if(size<2)throw new RangeError('fast-weight memory needs at least two direction columns');
  return new Float32Array(size);
}

export function resetFastWeightMemory(memory){memory.fill(0);return memory}

export function fastWeightVector(memory){
  const step=Math.PI*2/memory.length;
  let x=0,z=0,total=0;
  for(let index=0;index<memory.length;index++){
    const weight=Math.max(0,memory[index]),angle=-Math.PI+index*step;
    x+=weight*Math.cos(angle);z+=weight*Math.sin(angle);total+=weight;
  }
  const magnitude=Math.hypot(x,z);
  return{x,z,total,magnitude,heading:magnitude?Math.atan2(z,x):0,confidence:total?clamp(magnitude/total,0,1):0};
}

export function homeVector(memory){
  const vector=fastWeightVector(memory);
  return{...vector,x:-vector.x,z:-vector.z,heading:wrapAngle(vector.heading+Math.PI)};
}

export function updateFastWeight(memory,{heading=0,speed=0,dt=0,dopamine=0,writeGate=true,learningRate=FAST_WEIGHT_DEFAULTS.learningRate,decayTau=FAST_WEIGHT_DEFAULTS.decayTau,maxWeight=FAST_WEIGHT_DEFAULTS.maxWeight,minSpeed=FAST_WEIGHT_DEFAULTS.minSpeed}={}){
  const safeDt=Math.max(0,finite(dt));
  const decay=Math.exp(-safeDt/Math.max(TAU_EPS,finite(decayTau,FAST_WEIGHT_DEFAULTS.decayTau)));
  for(let index=0;index<memory.length;index++)memory[index]*=decay;
  const safeSpeed=Math.max(0,finite(speed));
  const safeDopamine=clamp(finite(dopamine),0,1);
  const contribution=Boolean(writeGate)&&safeSpeed>=Math.max(0,finite(minSpeed,FAST_WEIGHT_DEFAULTS.minSpeed))&&safeDopamine>0
    ? safeSpeed*safeDt*Math.max(0,finite(learningRate,FAST_WEIGHT_DEFAULTS.learningRate))*safeDopamine
    : 0;
  const column=contribution?directionColumn(heading,memory.length):-1;
  let delta=0;
  if(column>=0){
    const before=memory[column];
    memory[column]=clamp(before+contribution,0,Math.max(0,finite(maxWeight,FAST_WEIGHT_DEFAULTS.maxWeight)));
    delta=memory[column]-before;
  }
  return{...fastWeightVector(memory),decay,column,delta,contribution,wrote:delta>0,writeGate:contribution>0};
}

export function fastWeightActionBias(memory,{yaw=0,returnMode=false,actions=6,gain=.6,minMagnitude=.15}={}){
  const bias=new Float32Array(actions);
  const home=homeVector(memory);
  if(!returnMode||home.magnitude<Math.max(0,minMagnitude))return{bias,used:false,relative:0,...home};
  const relative=wrapAngle(home.heading-finite(yaw));
  const strength=Math.max(0,finite(gain))*clamp(home.magnitude/3,0,1);
  if(actions>0)bias[0]=strength*Math.max(0,Math.cos(relative));
  if(actions>1)bias[1]=strength*Math.max(0,Math.sin(relative));
  if(actions>2)bias[2]=strength*Math.max(0,-Math.sin(relative));
  if(actions>5)bias[5]=strength*.08;
  return{bias,used:true,relative,...home};
}
