import{test}from'node:test';
import assert from'node:assert/strict';
import{FAST_WEIGHT_COLUMNS,createFastWeightMemory,directionColumn,fastWeightActionBias,fastWeightVector,homeVector,resetFastWeightMemory,updateFastWeight}from'../lib/fast-weight-memory.mjs';

test('directionColumn asigna una dirección y su opuesta a columnas distintas',()=>{
  const east=directionColumn(0),west=directionColumn(Math.PI);
  assert.equal(east,4);assert.equal(west,0);assert.notEqual(east,west);
});

test('updateFastWeight escribe solo con velocidad, dopamina y puerta activos',()=>{
  const memory=createFastWeightMemory();
  const idle=updateFastWeight(memory,{heading:0,speed:1,dt:1,dopamine:0,writeGate:true});
  assert.equal(idle.wrote,false);assert.equal(memory[4],0);
  const write=updateFastWeight(memory,{heading:0,speed:1,dt:1,dopamine:1,writeGate:true});
  assert.equal(write.wrote,true);assert.ok(memory[4]>0);assert.equal(write.column,4);
});

test('la memoria decae sin borrar de golpe el vector acumulado',()=>{
  const memory=createFastWeightMemory();
  updateFastWeight(memory,{heading:0,speed:1,dt:1,dopamine:1});
  const before=fastWeightVector(memory).magnitude;
  updateFastWeight(memory,{dt:9,decayTau:18});
  const after=fastWeightVector(memory).magnitude;
  assert.ok(after>0&&after<before);
});

test('homeVector invierte el vector almacenado para volver al dock',()=>{
  const memory=createFastWeightMemory();
  for(let i=0;i<12;i++)updateFastWeight(memory,{heading:0,speed:1,dt:1,dopamine:1,decayTau:1e9});
  const outbound=fastWeightVector(memory),home=homeVector(memory);
  assert.ok(outbound.x>0);assert.ok(home.x<0);assert.ok(Math.abs(home.heading-Math.PI)<.2);
});

test('resetFastWeightMemory elimina la memoria episódica',()=>{
  const memory=createFastWeightMemory(FAST_WEIGHT_COLUMNS);memory.fill(2);
  resetFastWeightMemory(memory);
  assert.deepEqual([...memory],Array(FAST_WEIGHT_COLUMNS).fill(0));
});

test('fastWeightActionBias solo guía durante el retorno y con memoria suficiente',()=>{
  const memory=createFastWeightMemory();
  for(let i=0;i<12;i++)updateFastWeight(memory,{heading:0,speed:1,dt:1,dopamine:1,decayTau:1e9});
  assert.equal(fastWeightActionBias(memory,{returnMode:false}).used,false);
  const bias=fastWeightActionBias(memory,{returnMode:true,yaw:Math.PI});
  assert.equal(bias.used,true);assert.ok(bias.bias[0]>0);
});
