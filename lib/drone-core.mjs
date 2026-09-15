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

export function warehouseTargetForEpisode(episode,profile='normal'){
  const aisles=['A01','A02','A03','A04'];
  const aisleIndex=Math.abs(episode*3)%aisles.length;
  const x=-23+(episode*5%9)*5.5;
  const y=profile==='hard'?2.1+(episode*7%4)*1.05:profile==='easy'?2.8+(episode%2)*.6:3.1+(episode*7%3)*.8;
  const bin=String(14+(episode*5%12)).padStart(3,'0');
  return{x,y,z:[-18,-6,6,18][aisleIndex],aisle:aisles[aisleIndex],bin:`${aisles[aisleIndex]} · ${bin}`};
}

export function successRate(history,window=100){
  const sample=history.slice(-window);
  return sample.length?sample.filter(Boolean).length/sample.length:0;
}
