const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),T=require('../app/tournament.js'),D=require('../app/storage.js');
function day(counts={md:8,wd:9}){
 const s=T.newDay();s.categories=s.categories.filter(c=>counts[c.id]);
 for(const c of s.categories)for(let i=0;i<counts[c.id];i++)s.entries.push({id:c.id+i,category:c.id,players:[0,1].map(j=>({name:'Имя '+c.id+i+'фамилия'+j,rating:1800-i*43-j*21}))});
 return s;
}
function round(s,category,seed=1){
 let n=seed;
 for(const m of s.matches.filter(m=>m.category===category&&m.status==='queued')){
  if(!C.matchAvailability(s,m).available)continue;
  C.assign(s,m.id,1,Date.now());n=(Math.imul(n,1664525)+1013904223)>>>0;
  const score=n%2?[[21,17],[14,21],[21,19]]:[[17,21],[18,21]];T.finish(s,m.id,score);T.validate(s);
 }
}
test('new real day has no fictional participants and is separate from demos',()=>{
 const s=T.newDay();assert.equal(s.started,false);assert.equal(s.entries.length,0);assert.equal(s.matches.length,0);assert.equal(s.settings.courts,7);
 assert.throws(()=>T.start(s),/двух/);assert.notEqual(D.key,'swisscourt-ui-md-wd-7-v1-live');
});
test('full Swiss tournaments 7–18 entrants complete five rounds without repetitions or duplicate byes',()=>{
 for(const n of [7,8,9,10,11,12,15,18])for(const seed of [17,123,555]){
  const s=day({md:n});T.start(s);
  for(let r=1;r<=5;r++){
   const matches=s.matches.filter(m=>m.round===r),bye=s.byes.filter(b=>b.round===r);
   assert.equal(matches.length,Math.floor(n/2));assert.equal(bye.length,n%2);
   assert.equal(new Set([...matches.flatMap(m=>[m.a,m.b]),...bye.map(b=>b.entryId)]).size,n);
   round(s,'md',seed+r);if(r<5){const proposal=T.draw(s,'md',r+1);assert.deepEqual(T.draw(s,'md',r+1),proposal);T.publish(s,proposal);}
  }
  assert.equal(T.roundStatus(s,'md').complete,true);
  assert.equal(new Set(s.matches.map(m=>[m.a,m.b].sort().join('/'))).size,s.matches.length);
  assert.equal(new Set(s.byes.map(b=>b.entryId)).size,s.byes.length);
  for(const row of T.standings(s,'md')){assert.equal(row.played+row.byes,5);assert.equal(row.points,row.wins+row.byes);}
 }
});
test('round robin for 2–6, including odd counts, schedules each pair exactly once with no bye points',()=>{
 for(const n of [2,3,4,5,6]){
  const s=day({md:n});T.start(s);assert.equal(s.matches.length,n*(n-1)/2);assert.equal(s.byes.length,0);
  for(let r=1;r<=T.roundCount(s,'md');r++)round(s,'md',r);
  assert.ok(s.matches.every(m=>m.status==='done'));assert.ok(T.standings(s,'md').every(r=>r.played===n-1));assert.equal(T.roundStatus(s,'md').complete,true);
 }
});
test('division progression is independent and incomplete or stale proposals cannot publish',()=>{
 const s=day();T.start(s);assert.throws(()=>T.publish(s,T.draw(s,'md',2)),/предыдущий/);
 round(s,'md');const proposed=T.draw(s,'md',2);
 const match=s.matches.find(m=>m.category==='md');T.finish(s,match.id,[[21,0],[21,0]]);
 const changed=T.draw(s,'md',2);
 if(JSON.stringify(changed)!==JSON.stringify(proposed))assert.throws(()=>T.publish(s,proposed),/изменились/);
 T.publish(s,changed);assert.equal(T.roundStatus(s,'md').round,2);assert.equal(T.roundStatus(s,'wd').round,1);
 assert.throws(()=>T.publish(s,changed),/опубликован/);
});
test('correction can propose redraw only before the next round starts; played results survive',()=>{
 const s=day({md:8});T.start(s);round(s,'md');T.publish(s,T.draw(s,'md',2));
 const old=s.matches[0];assert.equal(T.finish(s,old.id,[[21,0],[21,0]]).redraw,'md');
 T.redraw(s,'md');C.assign(s,s.matches.find(m=>m.round===2).id,1);
 const snapshot=JSON.stringify(s.matches.filter(m=>m.round===2));
 assert.equal(T.finish(s,old.id,[[0,21],[0,21]]).redraw,null);assert.equal(JSON.stringify(s.matches.filter(m=>m.round===2)),snapshot);
 assert.throws(()=>T.redraw(s,'md'),/Начавшийся/);assert.equal(s.history.length,2);
});
test('circle equality uses personal wins and differences, all-match differences, then lower rating',()=>{
 const s=day({md:3});T.start(s);
 // Three-cycle: equal wins, sets and shuttle differences; lower seed wins the final criterion.
 const ids=s.entries.map(e=>e.id),wins=new Set([ids[0]+'/'+ids[1],ids[1]+'/'+ids[2],ids[2]+'/'+ids[0]]);
 for(const m of s.matches){m.status='done';m.endedAt=1;m.scores=wins.has(m.a+'/'+m.b)?[[21,15],[21,15]]:[[15,21],[15,21]];}
 const rows=T.standings(s,'md');assert.deepEqual(rows.map(r=>r.entry.id),ids.slice().reverse());assert.ok(rows.every(r=>r.personalPoints===1&&r.personalSets===0&&r.personalBalls===0));
 const m=s.matches[0];m.scores=[[21,0],[21,0]];assert.equal(T.standings(s,'md')[0].entry.id,m.a);
 for(const e of s.entries)e.players.forEach(p=>p.rating=1000);for(const m of s.matches)m.scores=wins.has(m.a+'/'+m.b)?[[21,15],[21,15]]:[[15,21],[15,21]];
 assert.ok(T.standings(s,'md').every(r=>r.place===1&&r.tied));
});
test('validation rejects incomplete ratings, duplicate players, invalid results and court collisions',()=>{
 const s=day();s.entries[0].players[0].rating=null;T.validate(s);assert.throws(()=>T.start(s),/рейтинг/);
 s.entries[0].players[0].rating=0;s.entries[1].players[0].name=s.entries[0].players[0].name;assert.throws(()=>T.validate(s),/уже есть/);
 const active=day();T.start(active);const [a,b]=active.matches;a.status=b.status='playing';a.court=b.court=1;a.startedAt=b.startedAt=1;assert.throws(()=>T.validate(active),/корта/);
});
test('storage restores exact ongoing courts and publishes state only after a successful write',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 let s=day();T.start(s);C.assign(s,s.matches[0].id,1,1234);s=D.commit(storage,s,s);
 assert.deepEqual(D.read(storage).state,s);
 const next=structuredClone(s);T.finish(next,next.matches[0].id,[[21,15],[21,17]],2345);
 const broken={...storage,setItem(k,v){if(k===D.key)throw Error('quota');storage.setItem(k,v);}};
 assert.throws(()=>D.commit(broken,next,s),/quota/);assert.deepEqual(D.read(storage).state,s);
 const saved=D.commit(storage,next,s);assert.equal(D.read(storage).state.matches[0].status,'done');assert.equal(saved.revision,s.revision+1);
 assert.throws(()=>D.commit(storage,next,s),/другой вкладке/);
 storage.setItem(D.key,'broken');const recovery=D.read(storage);assert.ok(recovery.error);assert.deepEqual(recovery.recovery,s);assert.equal(storage.getItem(D.key),'broken');
});
