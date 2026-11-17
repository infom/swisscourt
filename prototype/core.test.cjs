const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');
const legacyDay=require('./fixtures/legacy-day.cjs');

function rankingRow(id,values={}){
 return {entry:{id},points:2,buchholz:5,berger:3,setsFor:4,setsAgainst:2,ballFor:120,ballAgainst:100,...values};
}
function standingsFixture(){
 const state={entries:'abcdefgh'.split('').map(id=>({id,category:'md'})),categories:[{id:'md',rounds:3}],matches:[],history:[]};
 for(const [index,pairs] of [['ab','cd','ef','gh'],['ca','be','dg','fh'],['ae','bg','fc','dh']].entries()){
  for(const [a,b] of pairs)state.matches.push({id:a+b,category:'md',round:index+1,a,b,status:'done',scores:[[21,15],[21,15]],endedAt:index+1});
 }
 return state;
}

test('Swiss standings count opponents and defeated opponents and rank equal points by both',()=>{
 const rows=C.standings(standingsFixture(),'md');
 assert.deepEqual(rows.map(r=>[r.entry.id,r.points,r.buchholz,r.berger,r.place]),[
  ['c',2,6,4,1],['a',2,5,3,2],['b',2,4,2,3],['f',2,3,2,4],
  ['d',2,3,1,5],['e',1,6,2,6],['g',1,4,0,7],['h',0,5,0,8]
 ]);
 const state=standingsFixture();C.finish(state,'fc',[[15,21],[15,21]],20);
 const after=C.standings(state,'md'),a=after.find(r=>r.entry.id==='a');
 assert.equal(after[0].entry.id,'c');assert.equal(after[0].points,3);
 assert.equal(a.buchholz,6,'an opponent’s corrected result updates every affected coefficient');
 assert.equal(a.berger,3,'losing to that opponent contributes only to opponents');
 assert.equal(state.matches.find(m=>m.id==='fc').endedAt,3);
});

test('ranking prioritizes points, then opponents, then defeated opponents before set ratios',()=>{
 for(const [key,values] of [['points',{points:3,buchholz:0,berger:0}],['buchholz',{buchholz:6,berger:0}],['berger',{berger:4}]]){
  const rows=C.rankStandings([rankingRow('b',{setsFor:100,setsAgainst:1}),rankingRow('a',{...values,setsFor:1,setsAgainst:100})],[]);
  assert.equal(rows[0].entry.id,'a',key);
  assert.deepEqual(rows.map(r=>r.place),[1,2]);
 }
});

test('head-to-head applies only to a remaining group of two and precedes set ratios',()=>{
 const meeting={a:'a',b:'b',scores:[[21,15],[21,15]]};
 const a=()=>rankingRow('a',{setsFor:2,setsAgainst:4}),b=()=>rankingRow('b',{setsFor:5,setsAgainst:1});
 const pair=C.rankStandings([b(),a(),rankingRow('c',{berger:2})],[meeting]);
 assert.deepEqual(pair.map(r=>r.entry.id),['a','b','c']);
 assert.equal(pair[0].headToHead,'a');
 const three=C.rankStandings([a(),b(),rankingRow('c')],[meeting]);
 assert.deepEqual(three.map(r=>r.entry.id),['b','c','a']);
 assert.ok(three.every(r=>!r.headToHead),'no pairwise head-to-head inside a three-way tie');
 assert.equal(C.rankStandings([a(),b()],[])[0].entry.id,'b','no meeting falls through to ratios');
});

test('ratios use division rather than difference and handle unbeaten and unplayed entries',()=>{
 const sets=C.rankStandings([rankingRow('b',{setsFor:6,setsAgainst:2}),rankingRow('a',{setsFor:4,setsAgainst:1})],[]);
 assert.equal(sets[0].entry.id,'a');
 const points=C.rankStandings([rankingRow('b',{ballFor:130,ballAgainst:100}),rankingRow('a',{ballFor:100,ballAgainst:75})],[]);
 assert.equal(points[0].entry.id,'a');
 const zero=C.rankStandings([
  rankingRow('empty',{setsFor:0,setsAgainst:0,ballFor:0,ballAgainst:0}),
  rankingRow('finite',{setsFor:100,setsAgainst:1}),
  rankingRow('unbeaten2',{setsFor:2,setsAgainst:0}),
  rankingRow('unbeaten4',{setsFor:4,setsAgainst:0})
 ],[]);
 assert.deepEqual(zero.map(r=>[r.entry.id,r.place,r.tied]),[['unbeaten2',1,true],['unbeaten4',1,true],['finite',3,false],['empty',4,false]]);
 const balls=C.rankStandings([rankingRow('empty',{ballFor:0,ballAgainst:0}),rankingRow('perfect',{ballFor:21,ballAgainst:0})],[]);
 assert.equal(balls[0].entry.id,'perfect');
 assert.deepEqual(C.rankStandings([],[]),[]);
});

test('full equality shares places and Swiss criteria are not applied to round-robin',()=>{
 const rows=C.rankStandings([rankingRow('z'),rankingRow('a'),rankingRow('last',{points:1})],[]);
 assert.deepEqual(rows.map(r=>[r.entry.id,r.place,r.tieSize]),[['z',1,2],['a',1,2],['last',3,1]]);
 const state=standingsFixture();state.entries=state.entries.slice(0,4);
 state.matches=state.matches.filter(m=>state.entries.some(e=>e.id===m.a)&&state.entries.some(e=>e.id===m.b));
 const robin=C.standings(state,'md');
 for(const row of robin)for(const other of robin.filter(r=>r.points===row.points))assert.equal(row.place,other.place);
 assert.equal(robin[0].entry.id,'c');
 assert.deepEqual(robin.filter(r=>r.points===0).map(r=>r.place),[3,3]);
});

test('assigned byes add capped virtual opponents to both coefficients without synthetic results',()=>{
 const state=standingsFixture();state.categories[0].rounds=5;
 state.entries.push({id:'i',category:'md'});
 state.byes=[{entryId:'a',round:4},{entryId:'e',round:4}];
 const rows=C.standings(state,'md'),a=rows.find(r=>r.entry.id==='a'),e=rows.find(r=>r.entry.id==='e');
 assert.deepEqual([a.points,a.wins,a.played,a.byeOpponentPoints,a.buchholz,a.berger],[3,2,3,2.5,8.5,6.5]);
 assert.deepEqual([e.points,e.wins,e.played,e.byeOpponentPoints,e.buchholz,e.berger],[2,1,3,2,9,4]);
 assert.equal(state.matches.length,12);
 assert.equal(a.setsFor,4);assert.equal(a.setsAgainst,2);
 assert.equal(rows.find(r=>r.entry.id==='i').byeOpponentPoints,0);
});

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

test('court duration and rest colors switch at the requested boundaries',()=>{
 assert.deepEqual([0,1,2,19,20,29,30,120].map(C.courtTiming),
  ['called','called','normal','normal','long','long','delayed','delayed']);
 assert.deepEqual([null,0,4,5,14,15,59,60,89,90,120].map(C.restTiming),
  ['unplayed','critical','critical','short','short','normal','normal','long','long','overdue','overdue']);
});

test('progress is chronological, uses each side’s scores and updates on correction',()=>{
 const state=C.seed('live',100000000),m=state.matches.find(m=>m.status==='playing');
 const before=C.entryProgress(state,m.a);
 assert.equal(before.length,1);
 assert.ok(before.every(g=>g.matchId!==m.id));
 C.finish(state,m.id,[[21,19],[17,21],[22,20]],100000001);
 let a=C.entryProgress(state,m.a),b=C.entryProgress(state,m.b);
 assert.equal(a.length,2);
 assert.deepEqual(a.map(g=>g.round),[1,2]);
 assert.deepEqual([a[1].won,a[1].setsFor,a[1].setsAgainst,a[1].deciding],[true,2,1,true]);
 assert.deepEqual([b[1].won,b[1].setsFor,b[1].setsAgainst,b[1].deciding],[false,1,2,true]);
 assert.equal(a[1].opponentId,m.b);
 assert.equal(b[1].opponentId,m.a);
 assert.deepEqual(b[1].scores,[[19,21],[21,17],[20,22]]);
 C.finish(state,m.id,[[15,21],[18,21]],100900000);
 a=C.entryProgress(state,m.a);b=C.entryProgress(state,m.b);
 assert.equal(a.length,2);
 assert.deepEqual([a[1].won,a[1].setsFor,a[1].setsAgainst,a[1].deciding],[false,0,2,false]);
 assert.deepEqual([b[1].won,b[1].setsFor,b[1].setsAgainst,b[1].deciding],[true,2,0,false]);
 assert.equal(m.endedAt,100000001);
 assert.deepEqual(C.entryProgress(C.seed('prep'),m.a),[]);
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
