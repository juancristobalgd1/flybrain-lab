import{test}from'node:test';
import assert from'node:assert/strict';
import{distance3,wrapAngle,rewardStep,phaseForEpisode,targetForEpisode,successRate}from'../lib/drone-core.mjs';

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
