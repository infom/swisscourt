const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');
const S=require('./simulation.js');

test('Yug-Arena schedule fits 150 minutes: 8 MD, 9 WD, 7 courts, 32 matches averaging 20 minutes',()=>{
 const plan=S.createPlan(),state=S.snapshot(plan,150*S.minute);
 assert.equal(state.settings.venue,'Юг-Арена');
 assert.equal(state.entries.filter(e=>e.category==='md').length,8);
 assert.equal(state.entries.filter(e=>e.category==='wd').length,9);
 assert.equal(state.settings.courts,7);
 assert.equal(state.matches.length,32);
 assert.ok(state.matches.every(m=>m.status==='done'&&C.validateScores(m.scores).ok));
 assert.ok(plan.finishedAt<=plan.endsAt);
 const durations=state.matches.map(m=>(m.endedAt-m.startedAt)/S.minute);
 assert.equal(durations.reduce((a,b)=>a+b,0)/durations.length,20);
 assert.equal(new Set(state.matches.map(m=>[m.a,m.b].sort().join('/'))).size,32);
 for(const entry of state.entries){
  const played=state.matches.filter(m=>[m.a,m.b].includes(entry.id)).sort((a,b)=>a.startedAt-b.startedAt);
  for(let i=1;i<played.length;i++)assert.ok(played[i].startedAt-played[i-1].endedAt>=15*S.minute,entry.id);
  assert.equal(played.length+state.byes.filter(b=>b.entryId===entry.id).length,4);
 }
});

test('every playback event is conflict-free and snapshots contain no future results',()=>{
 const plan=S.createPlan();
 for(const at of new Set(plan.events.map(e=>e.at))){
  const state=S.snapshot(plan,at-plan.startsAt),active=state.matches.filter(m=>m.status==='playing');
  assert.equal(new Set(active.map(m=>m.court)).size,active.length);
  assert.equal(new Set(active.flatMap(m=>[m.a,m.b])).size,active.length*2);
  assert.ok(active.length<=7);
  assert.ok(state.matches.filter(m=>m.status==='done').every(m=>m.endedAt<=at));
  assert.ok(state.matches.every(m=>!m.plannedScores&&!m.plannedEnd));
 }
 const initial=S.snapshot(plan,0);
 assert.equal(initial.matches.filter(m=>m.status==='playing').length,7);
 assert.equal(initial.matches.filter(m=>m.status==='done').length,0);
 const firstFinish=plan.events.find(e=>e.type==='finish').at-plan.startsAt;
 assert.equal(S.snapshot(plan,firstFinish-1).matches.filter(m=>m.status==='done').length,0);
 assert.ok(S.snapshot(plan,firstFinish).matches.some(m=>m.status==='done'));
});

test('each women’s bye is unique, earns a point and is distinct from wins and played matches',()=>{
 const plan=S.createPlan(),state=S.snapshot(plan,150*S.minute);
 assert.equal(state.byes.length,4);
 assert.equal(new Set(state.byes.map(b=>b.entryId)).size,4);
 assert.ok(state.byes.every(b=>b.category==='wd'));
 for(const row of C.standings(state,'wd')){
  const byes=state.byes.filter(b=>b.entryId===row.entry.id);
  assert.equal(row.points,row.wins+byes.length);
  assert.equal(row.played+byes.length,4);
  assert.equal(C.entryProgress(state,row.entry.id).filter(g=>g.bye).length,byes.length);
  assert.equal(C.entryProgress(state,row.entry.id).length,4);
 }
});

test('playback covers 2.5 hours in 15 minutes, respects pause and clamps to its duration',()=>{
 const control={anchorAt:1000,elapsedMs:0,paused:false};
 assert.equal(S.playbackElapsed(control,1000+15*S.minute),150*S.minute);
 assert.equal(S.playbackElapsed(control,1000+60*S.minute),150*S.minute);
 const paused={anchorAt:4000,elapsedMs:30000,paused:true};
 assert.equal(S.playbackElapsed(paused,999999),30000);
 const resumed={...paused,paused:false,anchorAt:999999};
 assert.equal(S.playbackElapsed(resumed,1000999),40000);
 assert.equal(S.playbackElapsed(control,0),0);
});
