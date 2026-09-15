export const ACTIONS=['FORWARD','YAW LEFT','YAW RIGHT','CLIMB','DESCEND','HOVER'];
export const MISSION_PHASES=['TAKEOFF','AISLE ENTRY','SCAN','AISLE EXIT','RETURN','DOCK'];
export const DEFAULT_DOCK=Object.freeze({x:-32,y:3.2,z:6});

export function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
export function distance3(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
export function wrapAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle))}

export function planWarehouseRoute(start,target,dock=DEFAULT_DOCK){
  const transitHeight=clamp(Math.max(start.y,target.y,dock.y),2.8,6.5);
  return [
    {x:start.x,y:transitHeight,z:start.z,phase:'TAKEOFF'},
    {x:dock.x+1,y:transitHeight,z:target.z,phase:'AISLE ENTRY'},
    {x:target.x,y:target.y,z:target.z,phase:'SCAN'},
    {x:dock.x+1,y:target.y,z:target.z,phase:'AISLE EXIT'},
    {x:dock.x+1,y:Math.max(target.y,dock.y),z:dock.z,phase:'RETURN'},
    {x:dock.x,y:dock.y,z:dock.z,phase:'DOCK'},
  ];
}

export function routeProgress(position,route,currentIndex=0){
  if(!route?.length)return 0;
  const total=route.slice(1).reduce((sum,point,index)=>sum+distance3(route[index],point),0);
  if(!total)return 1;
  const index=Math.max(0,Math.min(route.length-1,currentIndex));
  let travelled=0;
  for(let i=0;i<Math.max(0,index-1);i++)travelled+=distance3(route[i],route[i+1]);
  if(index>0){
    const segment=distance3(route[index-1],route[index]);
    travelled+=clamp(segment-distance3(position,route[index]),0,segment);
  }
  return clamp(travelled/total,0,1);
}

export function scanReadiness({distance,speed,clearance,dwell=0,requiredDwell=2,minClearance=1.2}){
  const inPosition=distance<=2.5;
  const stable=speed<=.35;
  const safe=clearance>=minClearance;
  const progress=clamp(dwell/requiredDwell,0,1);
  return {ready:inPosition&&stable&&safe&&dwell>=requiredDwell,inPosition,stable,safe,progress};
}

export function batteryDrain({dt,speed=0,altitude=0,payload=0}){
  return Math.max(0,dt*(.0003+speed*.00018+altitude*.00002+payload*.0001));
}

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
  const x=-24+(episode*5%6)*3;
  const y=profile==='hard'?2.1+(episode*7%4)*1.05:profile==='easy'?2.8+(episode%2)*.6:3.1+(episode*7%3)*.8;
  const bin=String(14+(episode*5%12)).padStart(3,'0');
  return{x,y,z:[-18,-6,6,18][aisleIndex],aisle:aisles[aisleIndex],bin:`${aisles[aisleIndex]} · ${bin}`};
}

export function successRate(history,window=100){
  const sample=history.slice(-window);
  return sample.length?sample.filter(Boolean).length/sample.length:0;
}
