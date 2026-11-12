const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');
const legacyDay=require('./fixtures/legacy-day.cjs');

test('primary demo has seven courts, MD and WD, valid results and coherent timelines',()=>{
 const now=100000000,state=C.seed('live',now);
 assert.equal(state.settings.courts,7);
 assert.deepEqual(state.categories.map(c=>c.code),['MD','WD']);
 assert.equal(state.entries.length,24);
 assert.ok(state.entries.every(e=>e.players.length===2));
 assert.equal(new Set(state.entries.flatMap(e=>e.players.map(p=>p.name))).size,48);
 const playing=state.matches.filter(m=>m.status==='playing');
 assert.deepEqual(playing.map(m=>m.court),[1,2,3,4,5,6]);
 assert.equal(new Set(playing.flatMap(m=>[m.a,m.b])).size,12);
 assert.ok(state.matches.filter(m=>m.status==='done').every(m=>C.validateScores(m.scores).ok));
 for(const active of playing){
  for(const id of [active.a,active.b])assert.ok(C.entryActivity(state,id,now).lastEndedAt<=active.startedAt);
 }
 for(const cat of state.categories){
  const pairs=state.matches.filter(m=>m.category===cat.id).map(m=>[m.a,m.b].sort().join('/'));
  assert.equal(new Set(pairs).size,pairs.length);
 }
 const next=C.queue(state,now)[0];C.assign(state,next.id,7,now);
 assert.equal(state.matches.filter(m=>m.status==='playing').length,7);
 assert.equal(C.seed('prep').settings.courts,7);
 assert.equal(C.seed('prep').matches.length,0);
});
test('badminton score limits and deuce',()=>{
 for(const [a,b] of [[21,0],[21,19],[22,20],[29,27],[30,28],[30,29],[19,21]])assert.equal(C.validGame(a,b),true,a+':'+b);
 for(const [a,b] of [[21,20],[22,19],[30,27],[31,29],[20,18],[21,21],[-1,21],[21.5,19],[NaN,21]])assert.equal(C.validGame(a,b),false,a+':'+b);
});
test('full match needs exactly two wins with ordered sets',()=>{
 assert.equal(C.validateScores([[21,15],[21,19]]).ok,true);
 assert.deepEqual(C.validateScores([[21,19],[18,21],[30,29]]).wins,[2,1]);
 for(const games of [[[21,19]],[[21,19],[21,19],[21,0]],[[21,19],['',''],[21,15]],[[21,19],[21,'']],[[21,20],[21,15]]])assert.equal(C.validateScores(games).ok,false);
});
test('assignment rejects occupied courts and players; return preserves opponents',()=>{
 const state=legacyDay('live',100000000),match=C.queue(state,100000000)[0],pair=[match.a,match.b];
 assert.throws(()=>C.assign(state,match.id,1,100000000));
 C.assign(state,match.id,4,100000000);
 assert.equal(match.court,4);assert.equal(match.status,'playing');
 const other=state.matches.find(m=>m.status==='queued');
 assert.throws(()=>C.assign(state,other.id,4));
 state.matches.push({...other,id:'collision',a:match.a,status:'queued'});
 assert.throws(()=>C.assign(state,'collision',other.court||3));
 C.returnToQueue(state,match.id);
 assert.equal(match.status,'queued');assert.equal(match.court,undefined);assert.deepEqual([match.a,match.b],pair);
});
test('finishing frees the court, affects standings, corrections keep rest timestamp',()=>{
 const state=legacyDay('live',100000000),match=state.matches.find(m=>m.status==='playing'),before=C.standings(state,match.category).find(r=>r.entry.id===match.a);
 C.finish(state,match.id,[[21,15],[21,16]],100000001);
 const after=C.standings(state,match.category).find(r=>r.entry.id===match.a);
 assert.equal(match.court,undefined);assert.equal(after.wins,before.wins+1);
 C.finish(state,match.id,[[15,21],[16,21]],100900000);
 assert.equal(state.history.length,1);assert.equal(match.endedAt,100000001);
 assert.equal(C.standings(state,match.category).find(r=>r.entry.id===match.a).wins,before.wins);
});
test('rest recommendation switches precisely at 15 minutes',()=>{
 const now=100000000,state=legacyDay('live',now),match=state.matches.find(m=>m.category==='md'&&m.status==='queued');
 assert.equal(C.restMinutes(state,match,now),8);
 const previous=state.matches.find(m=>m.status==='done'&&[m.a,m.b].includes(match.a));
 previous.endedAt=now-899999;
 assert.equal(C.restMinutes(state,match,now),14);
 assert.equal(C.restMinutes(state,match,now+1),15);
 const sorted=C.queue(state,now);const shortIndex=sorted.findIndex(m=>C.restMinutes(state,m,now)<15);assert.ok(sorted.indexOf(match)>=shortIndex);assert.ok(sorted.slice(shortIndex).every(m=>C.restMinutes(state,m,now)<15));
});
test('round-robin for six has 15 distinct pairings without same-round conflicts',()=>{
 const ids=['a','b','c','d','e','f'],seen=new Set();
 for(let round=1;round<=5;round++){const pairs=C.roundRobin(ids,round);assert.equal(new Set(pairs.flat()).size,6);for(const pair of pairs){const key=pair.slice().sort().join('-');assert.equal(seen.has(key),false);seen.add(key);}}
 assert.equal(seen.size,15);
});
test('legacy fixture entries are unique, pair average precise, preparation has no matches',()=>{
 const state=legacyDay(),players=state.entries.flatMap(e=>e.players.map(p=>p.name));
 assert.equal(new Set(players).size,46);assert.equal(legacyDay('prep').matches.length,0);
 assert.equal(C.rating({players:[{rating:1800},{rating:1601}]}),1700.5);
 for(const cat of state.categories){const pairs=C.firstPairs(state.entries.filter(e=>e.category===cat.id));assert.equal(new Set(pairs.flat()).size,pairs.length*2);}
});

test('namesakes get initials across divisions, labels update after edits',()=>{
 const state=legacyDay();
 const maria=state.entries.find(e=>e.id==='xd1').players[1];
 const julia=state.entries.find(e=>e.id==='xd2').players[1];
 assert.equal(C.playerLabel(state,maria),'ЧЕРНОВА М');
 assert.equal(C.playerLabel(state,julia),'ЧЕРНОВА Ю');
 julia.name='Юлия Волкова';
 assert.equal(C.playerLabel(state,maria),'ЧЕРНОВА');
 state.entries.find(e=>e.id==='ws1').players[0].name='Елена Чёрнова';
 assert.equal(C.playerLabel(state,maria),'ЧЕРНОВА М');
 assert.equal(C.entryLabel(state,'xd1'),'СОКОЛОВ / ЧЕРНОВА М');
});

test('blocked games remain listed with busy court and previous-round reasons',()=>{
 const now=100000000,state=legacyDay('live',now);
 const playing=state.matches.find(m=>m.category==='ws'&&m.status==='playing');
 const pending=state.matches.find(m=>m.category==='ws'&&m.round===4&&[m.a,m.b].includes(playing.a));
 const availability=C.matchAvailability(state,pending);
 assert.equal(availability.available,false);
 assert.ok(availability.blockers.some(b=>b.type==='busy'&&b.court===3));
 assert.ok(availability.blockers.some(b=>b.type==='round'&&b.round===3));
 assert.ok(C.queueItems(state,now).includes(pending));
 assert.ok(!C.queue(state,now).includes(pending));
 assert.throws(()=>C.assign(state,pending.id,4,now));
 const current=state.matches.filter(m=>m.category==='ws'&&m.round===3);
 for(const match of current){if(match.status==='queued')C.assign(state,match.id,4,now);C.finish(state,match.id,[[21,17],[21,18]],now);}
 assert.equal(C.matchAvailability(state,pending).available,true);
 assert.ok(C.queue(state,now).includes(pending));
});

test('known round-robin migration is idempotent and preserves existing results',()=>{
 const state=legacyDay(),oldMatches=structuredClone(state.matches.filter(m=>!m.id.startsWith('rr-')));
 state.matches=structuredClone(oldMatches);
 C.ensureRoundRobinSchedule(state);
 assert.equal(state.matches.filter(m=>m.category==='ws').length,15);
 assert.deepEqual(state.matches.filter(m=>!m.id.startsWith('rr-')),oldMatches);
 const once=JSON.stringify(state);C.ensureRoundRobinSchedule(state);assert.equal(JSON.stringify(state),once);
});

test('lookup distinguishes playing, recommended queue, waiting and preparation',()=>{
 const now=100000000,state=legacyDay('live',now);
 const active=state.matches.find(m=>m.status==='playing');
 assert.equal(C.nextForEntry(state,active.a,now).kind,'playing');
 const first=C.queue(state,now)[0];
 assert.equal(C.nextForEntry(state,first.a,now).position,1);
 assert.equal(C.nextForEntry(legacyDay('prep',now),'xd1',now).kind,'preparation');
 const blocked=state.matches.find(m=>m.category==='ws'&&m.round===4&&[m.a,m.b].includes('ws1'));
 for(const match of state.matches.filter(m=>m.category==='ws'&&m.round===3&&[m.a,m.b].includes('ws1'))){if(match.status==='queued')C.assign(state,match.id,4,now);C.finish(state,match.id,[[21,17],[21,18]],now);}
 const next=C.nextForEntry(state,'ws1',now);
 assert.equal(next.kind,'blocked');assert.equal(next.match.id,blocked.id);
});

test('conflicts and rest are detected by actual players even across entry ids',()=>{
 const now=100000000,state=legacyDay('live',now),active=state.matches.find(m=>m.status==='playing');
 const source=state.entries.find(e=>e.id===active.a);
 state.entries.push({...structuredClone(source),id:'duplicate-entry'});
 const candidate={id:'duplicate-game',a:'duplicate-entry',b:'md8',category:'md',round:1,status:'queued'};
 state.matches.push(candidate);
 assert.equal(C.matchAvailability(state,candidate).available,false);
 assert.ok(C.matchAvailability(state,candidate).blockers.some(b=>b.type==='busy'));
 assert.throws(()=>C.assign(state,candidate.id,4,now));
 C.finish(state,active.id,[[21,17],[21,18]],now);
 assert.equal(C.entryActivity(state,'duplicate-entry',now+60000).restMinutes,1);
});
