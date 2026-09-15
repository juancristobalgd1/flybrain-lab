import{test}from'node:test';
import assert from'node:assert/strict';
import{distance3,wrapAngle,rewardStep,phaseForEpisode,targetForEpisode,warehouseTargetForEpisode,successRate,planWarehouseRoute,routeProgress,scanReadiness,batteryDrain}from'../lib/drone-core.mjs';

test('distance3 calcula distancia euclídea 3D',()=>assert.equal(distance3({x:0,y:0,z:0},{x:3,y:4,z:12}),13));
test('wrapAngle mantiene el ángulo entre -PI y PI',()=>assert.ok(Math.abs(wrapAngle(Math.PI*3)-Math.PI)<1e-9));
test('rewardStep premia progreso y penaliza colisión',()=>{
  const progress=rewardStep({previousDistance:10,distance:9,collision:false,reached:false,batteryUsed:.01});
  const crash=rewardStep({previousDistance:10,distance:9,collision:true,reached:false,batteryUsed:.01});
  assert.ok(progress>0);assert.ok(crash<progress);
});
test('rewardStep da recompensa terminal al alcanzar objetivo',()=>assert.ok(rewardStep({previousDistance:1,distance:.5,collision:false,reached:true,batteryUsed:.01})>2));
test('phaseForEpisode reserva cada décimo episodio para TEST',()=>{assert.equal(phaseForEpisode(10),'TEST');assert.equal(phaseForEpisode(11),'TRAIN')});
test('targetForEpisode es determinista y successRate usa la ventana solicitada',()=>{
  assert.deepEqual(targetForEpisode(42),targetForEpisode(42));
  assert.equal(successRate([false,true,true],2),1);
});
test('warehouseTargetForEpisode devuelve una ubicación de pasillo determinista',()=>{
  const target=warehouseTargetForEpisode(23,'normal');
  assert.match(target.aisle,/^A0[1-4]$/);
  assert.match(target.bin,/^A0[1-4] · \d{3}$/);
  assert.ok([-18,-6,6,18].includes(target.z));
  assert.deepEqual(target,warehouseTargetForEpisode(23,'normal'));
});
test('planWarehouseRoute conecta el muelle, el pasillo, el escaneo y el regreso',()=>{
  const route=planWarehouseRoute({x:-32,y:3.2,z:6},warehouseTargetForEpisode(23));
  assert.deepEqual(route.map(point=>point.phase),['TAKEOFF','AISLE ENTRY','SCAN','AISLE EXIT','RETURN','DOCK']);
  assert.deepEqual(route.at(-1),{x:-32,y:3.2,z:6,phase:'DOCK'});
  assert.equal(route[2].z,warehouseTargetForEpisode(23).z);
});
test('routeProgress crece por checkpoints y nunca sale de 0..1',()=>{
  const route=planWarehouseRoute({x:-32,y:3.2,z:6},{x:-18,y:3.2,z:-6});
  assert.equal(routeProgress(route[0],route,0),0);
  assert.ok(routeProgress(route[1],route,1)>0);
  assert.equal(routeProgress(route.at(-1),route,route.length-1),1);
  assert.ok(routeProgress({x:999,y:999,z:999},route,route.length-1)<=1);
});
test('scanReadiness exige posición, estabilidad, despeje y permanencia',()=>{
  const base={distance:1.8,speed:.1,clearance:2,dwell:2};
  assert.equal(scanReadiness(base).ready,true);
  assert.equal(scanReadiness({...base,speed:.8}).ready,false);
  assert.equal(scanReadiness({...base,clearance:.4}).ready,false);
  assert.equal(scanReadiness({...base,dwell:.5}).progress,.25);
});
test('batteryDrain es positiva y aumenta con velocidad y carga',()=>{
  const idle=batteryDrain({dt:1,speed:0,altitude:3,payload:0});
  const loaded=batteryDrain({dt:1,speed:3,altitude:6,payload:1});
  assert.ok(idle>0);
  assert.ok(loaded>idle);
});
