export const ACTIONS=['FORWARD','YAW LEFT','YAW RIGHT','CLIMB','DESCEND','HOVER'];

export function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
export function distance3(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
export function wrapAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle))}

export function rewardStep({previousDistance,distance,collision,reached,batteryUsed}){
  const progress=clamp(previousDistance-distance,-1,1)*.12;
  return progress+(reached?2:0)-(collision?.8:0)-batteryUsed*.02-.001;
}

export function phaseForEpisode(episode){return episode%10===0?'TEST':'TRAIN'}

export function targetForEpisode(episode,radius=22){
  const angle=episode*2.399963229728653;
  const r=8+(episode*7%Math.max(1,radius-7));
  return{x:Math.cos(angle)*r,y:3+(episode*11%10),z:Math.sin(angle)*r};
}

export function successRate(history,window=100){
  const sample=history.slice(-window);
  return sample.length?sample.filter(Boolean).length/sample.length:0;
}
