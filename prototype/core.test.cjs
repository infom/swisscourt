const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');
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
 const state=C.seed('live',100000000),match=C.queue(state,100000000)[0],pair=[match.a,match.b];
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
 const state=C.seed('live',100000000),match=state.matches.find(m=>m.status==='playing'),before=C.standings(state,match.category).find(r=>r.entry.id===match.a);
 C.finish(state,match.id,[[21,15],[21,16]],100000001);
 const after=C.standings(state,match.category).find(r=>r.entry.id===match.a);
 assert.equal(match.court,undefined);assert.equal(after.wins,before.wins+1);
 C.finish(state,match.id,[[15,21],[16,21]],100900000);
 assert.equal(state.history.length,1);assert.equal(match.endedAt,100000001);
 assert.equal(C.standings(state,match.category).find(r=>r.entry.id===match.a).wins,before.wins);
});
test('rest recommendation switches precisely at 15 minutes',()=>{
 const now=100000000,state=C.seed('live',now),match=state.matches.find(m=>m.category==='md'&&m.status==='queued');
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
test('seed entries are unique, pair average precise, preparation has no matches',()=>{
 const state=C.seed(),players=state.entries.flatMap(e=>e.players.map(p=>p.name));
 assert.equal(new Set(players).size,46);assert.equal(C.seed('prep').matches.length,0);
 assert.equal(C.rating({players:[{rating:1800},{rating:1601}]}),1700.5);
 for(const cat of C.categories){const pairs=C.firstPairs(state.entries.filter(e=>e.category===cat.id));assert.equal(new Set(pairs.flat()).size,pairs.length*2);}
});
