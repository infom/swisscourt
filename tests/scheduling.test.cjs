const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),T=require('../app/tournament.js'),A=require('../app/scheduling.js'),D=require('../app/storage.js');
const {boot}=require('./ui-harness.cjs');
const win=[[21,15],[21,17]],loss=[[15,21],[17,21]],key=m=>[m.a,m.b].sort().join('|');
function day(n=8){
 const state=T.newDay();state.categories=state.categories.filter(c=>c.id==='md');
 for(let i=0;i<n;i++)state.entries.push({id:'e'+i,category:'md',players:[{name:'Имя Фамилия'+i+'а',rating:2000-i*50},{name:'Другой Фамилия'+i+'б',rating:1900-i*50}]});
 T.start(state);return state;
}
function finish(state,m,scores=win){if(m.status==='queued')C.assign(state,m.id,1);T.finish(state,m.id,scores);}
function nearlyDone(n=8){const s=day(n);for(const m of s.matches.slice(0,-1))finish(s,m);return s;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('round robin can call a known later encounter while unrelated earlier games continue',()=>{
 const s=day(6),candidate=s.matches.find(m=>m.round===2);
 const own=s.matches.filter(m=>m.round===1&&[m.a,m.b].some(id=>[candidate.a,candidate.b].includes(id)));
 assert.equal(C.matchAvailability(s,candidate).available,false);
 for(const m of own)finish(s,m);
 const last=s.matches.find(m=>m.round===1&&m.status==='queued');assert.ok(last);C.assign(s,last.id,1);
 assert.equal(C.matchAvailability(s,candidate).available,true);
 assert.ok(C.restMinutes(s,candidate)<15,'short rest remains a warning, not a prohibition');
 C.assign(s,candidate.id,2);T.validate(s);
 assert.equal(s.matches.filter(m=>m.status==='playing').length,2);
});
test('Swiss early pairs are identical under every remaining winner and contain only ready players',()=>{
 for(const n of [7,8,9,10])for(const mask of [0,1,3]){
  const s=day(n),completed=s.matches.slice(0,-2);
  completed.forEach((m,i)=>finish(s,m,mask&(1<<i)?loss:win));
  const before=JSON.stringify(s),proposal=A.plan(s,'md'),pending=s.matches.filter(m=>m.status!=='done');
  assert.equal(JSON.stringify(s),before,'analysis must never save hypothetical results');
  if(!proposal)continue;
  assert.equal(proposal.complete,false);assert.equal(proposal.combinations,2**pending.length);
  for(let outcome=0;outcome<2**pending.length;outcome++){
   const possible=structuredClone(s);pending.forEach((m,i)=>{const copy=possible.matches.find(x=>x.id===m.id);copy.status='done';copy.scores=outcome&(1<<i)?loss:win;copy.endedAt=1;});
   const pairs=new Set(T.draw(possible,'md',2).matches.map(key));
   for(const m of proposal.matches){assert.ok(pairs.has(key(m)));assert.ok(pending.every(p=>![p.a,p.b].some(id=>[m.a,m.b].includes(id))));}
  }
 }
});
test('early matches enter queue, can finish before the older round and survive sealing and recovery',()=>{
 const s=nearlyDone(),late=s.matches.at(-1);C.assign(s,late.id,1);
 const proposal=A.plan(s,'md');assert.ok(proposal.matches.length>0);A.apply(s,proposal);T.validate(s);
 const early=s.matches.find(m=>m.round===2);assert.ok(C.queue(s).includes(early));C.assign(s,early.id,2);
 assert.equal(C.nextForEntry(s,early.a).match.court,2);
 T.finish(s,early.id,loss);T.validate(s);const preserved=structuredClone(early);
 assert.equal(T.roundStatus(s,'md').complete,false);assert.equal(T.roundStatus(s,'md').partial,true);
 assert.deepEqual(D.decode(JSON.stringify(s)),s);
 T.finish(s,late.id,win);const completion=A.plan(s,'md');assert.equal(completion.complete,true);A.apply(s,completion);T.validate(s);
 assert.deepEqual(s.matches.find(m=>m.id===early.id),preserved,'published opponent, court history and scores stay fixed');
 assert.equal(s.matches.filter(m=>m.round===2).length,4);assert.equal(s.partialRounds.length,0);
 assert.equal(new Set(s.matches.map(key)).size,s.matches.length);
});
test('odd-field bye is awarded once only when the previous round settles',()=>{
 const s=nearlyDone(9),late=s.matches.at(-1);A.apply(s,A.plan(s,'md'));T.validate(s);
 assert.equal(s.byes.length,1);assert.ok(s.partialRounds.length);
 finish(s,late,loss);A.apply(s,A.plan(s,'md'));T.validate(s);
 assert.equal(s.byes.length,2);assert.equal(new Set(s.byes.map(b=>b.entryId)).size,2);
 assert.equal(A.plan(s,'md'),null);
 assert.deepEqual(D.decode(JSON.stringify(s)),s);
});
test('correcting an earlier winner invalidates uncalled early matches but preserves started encounters',()=>{
 const s=nearlyDone(9);A.apply(s,A.plan(s,'md'));
 const early=s.matches.filter(m=>m.round===2);assert.equal(early.length,2);C.assign(s,early[0].id,2);
 early[1].pinned=true;
 T.finish(s,s.matches[0].id,[[21,16],[21,18]]);assert.ok(s.matches.some(m=>m.id===early[1].id&&m.pinned),'same winner does not invalidate the proof');
 const running=structuredClone(early[0]);const result=T.finish(s,s.matches[0].id,loss);
 assert.equal(result.recheck,true);assert.ok(!s.matches.some(m=>m.id===early[1].id));assert.deepEqual(s.matches.find(m=>m.id===running.id),running);T.validate(s);
 const late=s.matches.find(m=>m.round===1&&m.status!=='done');finish(s,late);A.apply(s,A.plan(s,'md'));T.validate(s);
 assert.deepEqual(s.matches.find(m=>m.id===running.id),running);
});
test('new early queues cannot start an entrant before their own previous encounter finishes',()=>{
 const s=nearlyDone();A.apply(s,A.plan(s,'md'));
 const early=s.matches.find(m=>m.round===2),previous=s.matches.find(m=>m.round===1&&[m.a,m.b].includes(early.a));
 previous.status='queued';delete previous.scores;delete previous.endedAt;
 assert.equal(C.matchAvailability(s,early).available,false);assert.throws(()=>C.assign(s,early.id,2));
 early.status='playing';early.court=2;early.startedAt=1;assert.throws(()=>T.validate(s),/свою предыдущую/);
});
test('background calculation rejects stale results and stores the new queue without closing score entry',async()=>{
 const workers=[];
 class Worker{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}respond(){this.onmessage({data:{proposal:A.plan(this.message.state,this.message.category)}});}}
 const s=nearlyDone(),late=s.matches.at(-1);C.assign(s,late.id,1);
 const ui=boot({realState:s,workerClass:Worker});assert.equal(workers.length,1);
 ui.run('scoreDialog(state.matches.find(m=>m.status==="playing").id)');
 ui.run('mutate(s=>T.finish(s,'+JSON.stringify(late.id)+',[[15,21],[17,21]]))');assert.equal(workers.length,2);
 workers[0].respond();await flush();assert.equal(ui.run('state.matches.filter(m=>m.round===2).length'),0);
 workers[1].respond();await flush();assert.equal(ui.run('state.matches.filter(m=>m.round===2).length'),4);
 assert.equal(ui.node('#dialog').open,true);
 assert.equal(D.decode(ui.storage.get(D.key)).matches.filter(m=>m.round===2).length,4);
 const board=boot({realState:D.decode(ui.storage.get(D.key)),hash:'#board'});assert.match(board.html(),/board-next-match/);
});
test('restoring an old v1 day automatically exposes stable games to organizer and scoreboard',async()=>{
 const s=nearlyDone(),ui=boot({realState:s});await flush();await flush();
 assert.ok(ui.run('state.matches.some(m=>m.round===2&&m.early)'));
 const saved=D.decode(ui.storage.get(D.key)),board=boot({realState:saved,hash:'#board'});
 assert.match(board.html(),/board-next-match/);assert.equal(board.run('state.matches.length'),saved.matches.length);
});
test('complete tournaments tolerate interleaved rounds, preserve all results and never duplicate byes',()=>{
 for(const n of [7,8,9,12,18]){
  const s=day(n);let completed=0,sawOverlap=false;
  while(!T.roundStatus(s,'md').complete){
   // Favor a newer available game to exercise genuine overlap, not just
   // ordinary sequential rounds with the early feature switched on.
   const ready=C.queue(s).slice().sort((a,b)=>b.round-a.round||a.id.localeCompare(b.id));
   const m=ready[0];assert.ok(m,'a ready game or a completed event must always allow progress');
   if(s.matches.some(other=>other.round<m.round&&other.status!=='done'))sawOverlap=true;
   finish(s,m,completed++%3===0?loss:win);T.validate(s);
   for(let i=0;i<10;i++){
    const proposal=A.plan(s,'md');if(!proposal)break;A.apply(s,proposal);T.validate(s);
   }
   assert.ok(completed<=Math.floor(n/2)*5);
  }
  assert.equal(completed,Math.floor(n/2)*5);assert.ok(sawOverlap);
  assert.equal(new Set(s.matches.map(key)).size,s.matches.length);
  for(const row of T.standings(s,'md'))assert.equal(row.played+row.byes,5);
  assert.deepEqual(D.decode(JSON.stringify(s)),s);
 }
});
