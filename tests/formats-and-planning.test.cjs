const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),T=require('../app/tournament.js'),B=require('../app/brackets.js'),P=require('../app/planning.js'),D=require('../app/storage.js');
const A=require('../app/scheduling.js'),{boot}=require('./ui-harness.cjs');
const win=[[21,15],[21,17]],lose=[[15,21],[17,21]];
function field(n,scheme='knockout',extra={}){
 const state=T.newDay(new Date('2026-11-21T12:00:00'));state.categories=state.categories.slice(0,1);
 Object.assign(state.categories[0],{scheme,planned:n,rounds:6,seeding:'rating',scoreFormat:'classic',bracketMode:'single'},extra);
 state.entries=Array.from({length:n},(_,i)=>({id:'p'+i,category:'md',players:[
  {name:'Имя Тестов'+i,rating:2000-i*10},{name:'Другой Проверкин'+i,rating:1900-i*10}
 ]}));
 return state;
}
function groups(n,count,mode='single'){
 const sizes=B.groupSizes(n,count);
 return field(n,'groups',{groupCount:count,playoffs:[1,2,3].map(place=>({
  mode,slots:sizes.flatMap((size,group)=>size>=place?[{group,place}]:[])
 }))});
}
function play(state,match,scores=win){
 C.assign(state,match.id,1,Date.parse(state.settings.date+'T10:00:00'));
 T.finish(state,match.id,scores,Date.parse(state.settings.date+'T10:20:00'));
}
function playAll(state,seed=1){
 T.start(state);
 const total=T.totalMatches(state,'md');
 for(let i=0;i<total;i++){
  let match=C.queue(state)[0];
  if(!match){
   const proposal=A.plan(state,'md');assert.ok(proposal,'a next round is available');
   A.apply(state,proposal);match=C.queue(state)[0];
  }
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  play(state,match,seed>2**31?win:lose);
  T.validate(state);
 }
 assert.equal(T.roundStatus(state,'md').complete,true);
 assert.deepEqual(D.decode(JSON.stringify(state)),state);
}
test('two-game winners are decided by shuttles, then lower rating, then a saved draw',()=>{
 const format=C.scoreFormats.two21;
 assert.equal(C.validateScores([[21,10],[18,21]],{format}).decidedBy,'balls');
 assert.equal(C.validateScores([[21,16],[16,21]],{format,ratings:[100,50]}).winner,1);
 const state=field(2,'circle',{scoreFormat:'two15'});
 state.entries.forEach(e=>e.players.forEach(p=>p.rating=100));
 T.start(state);const id=state.matches[0].id;
 play(state,state.matches[0],[[15,11],[11,15]]);
 const result=C.matchResult(state,state.matches[0]);
 assert.equal(result.decidedBy,'lot');
 assert.equal(C.matchResult(D.decode(JSON.stringify(state)),state.matches[0]).winner,result.winner);
 T.finish(state,id,[[15,11],[11,15]]);
 assert.equal(C.matchResult(state,state.matches[0]).winner,result.winner);
 T.validate(state);
 assert.equal(C.validateScores([[21,12],[12,21],[11,5]],{format:C.scoreFormats.shortFinal}).winner,0);
 assert.equal(C.validateScores([[15,12],[12,15],[21,20]],{format:C.scoreFormats.best15}).winner,0);
 assert.equal(C.shortScore([[12,21],[21,19],[24,22]]),'−12;19;22');
});
test('Swiss compares first two games before total shuttle difference once earlier criteria tie',()=>{
 const base={points:2,buchholz:4,berger:2,setsFor:4,setsAgainst:3,ballFor:100,ballAgainst:90};
 const rows=[
  {...base,entry:{id:'one'},firstTwoDiff:2,ballFor:130},
  {...base,entry:{id:'two'},firstTwoDiff:3,ballFor:90},
  {...base,entry:{id:'three'},firstTwoDiff:3,ballFor:95,ballAgainst:89}
 ];
 assert.deepEqual(C.rankStandings(rows,[]).map(r=>r.entry.id),['three','two','one']);
});
test('Swiss can finish six rounds without repeats even when a greedy draw gets stuck',()=>{
 for(const n of [7,8,9,10,32]){
  const state=field(n,'swiss');
  playAll(state,991);
  assert.equal(state.matches.length,Math.floor(n/2)*6);
  assert.equal(new Set(state.matches.map(m=>[m.a,m.b].sort().join('-'))).size,state.matches.length);
  assert.equal(new Set(state.byes.map(b=>b.entryId)).size,n%2?6:0);
 }
});
test('four knockout modes give exact counts with byes and full placement resolves every place',()=>{
 for(const [n,expected] of [[10,[9,10,14,15]],[16,[15,16,26,32]]]){
  ['single','bronze','selected','full'].forEach((mode,index)=>{
   const state=field(n,'knockout',{bracketMode:mode});
   const counts=P.estimate(state);
   assert.equal(counts.invalid,false);
   assert.equal(counts.count,expected[index]);
   playAll(state);
   const places=T.standings(state,'md').map(r=>r.place);
   if(mode==='full')assert.deepEqual(places,Array.from({length:n},(_,i)=>i+1));
   if(mode==='selected')assert.ok(places.includes(5)&&places.includes(9));
  });
 }
});
test('the agreed group examples progress into independent brackets and finish every scheduled game',()=>{
 for(const [n,count,mode,total] of [[6,2,'single',9],[7,2,'single',12],[12,4,'bronze',24]]){
  const state=groups(n,count,mode);
  assert.equal(P.estimate(state).count,total);
  playAll(state);
  assert.equal(state.matches.length,total);
  assert.equal(T.standings(state,'md').length,n);
 }
 const state=groups(6,2);
 state.categories[0].playoffs[1].slots.push({group:0,place:1});
 assert.throws(()=>T.start(state),/только в одну сетку/);
});
test('bracket advances when opponents are determined and protects called matches from stale corrections',()=>{
 const state=field(4,'knockout',{bracketMode:'bronze'});T.start(state);
 const semis=state.matches.slice();play(state,semis[0]);assert.equal(state.matches.length,2);
 play(state,semis[1]);assert.equal(state.matches.length,4);
 const final=state.matches.find(m=>m.forPlace===1&&m.round===2);
 C.assign(state,final.id,1);
 const snapshot=JSON.stringify(state);
 assert.throws(()=>T.finish(state,semis[0].id,lose),/уже начавшейся/);
 assert.equal(JSON.stringify(state),snapshot);
});
test('forecast uses common courts, rest and rental duration for parallel categories',()=>{
 const state=field(2,'circle');
 const women={...T.divisions.find(c=>c.id==='wd'),scheme:'circle',planned:2,scoreFormat:'classic',seeding:'rating'};
 state.categories.push(women);
 state.entries.push(...state.entries.slice().map(e=>({...e,id:e.id+'w',category:'wd',players:e.players.map(p=>({...p,name:p.name+'а'}))})));
 state.settings.courts=1;state.settings.rentalMinutes=30;
 const single=P.estimate(state);
 assert.equal(single.count,2);assert.equal(single.court,40);assert.equal(single.duration,40);assert.equal(single.reserve,-10);
 state.settings.courts=2;
 const double=P.estimate(state);
 assert.equal(double.duration,20);assert.equal(double.reserve,10);
 const circle=field(4,'circle');circle.settings.courts=2;
 assert.equal(P.estimate(circle).duration,90);
});
test('live forecast uses the actual launch and legacy first calls instead of the calendar date',()=>{
 const state=field(2,'circle');
 state.settings.date='2026-11-17';
 state.settings.rentalMinutes=150;
 const launch=Date.parse('2026-11-21T15:30:00+03:00');
 T.start(state,launch);
 C.assign(state,state.matches[0].id,1,launch+5*60000);
 const now=launch+10*60000;
 const forecast=P.estimate(state,{actual:true,now});
 assert.deepEqual([forecast.budget,forecast.elapsed,forecast.duration,forecast.remaining,forecast.reserve],[150,10,25,15,125]);
 const legacy=structuredClone(state);
 delete legacy.startedAt;
 delete legacy.settings.rentalMinutes;
 Object.assign(legacy.settings,{start:'10:00',end:'12:30'});
 T.validate(legacy);
 const restored=P.estimate(legacy,{actual:true,now});
 assert.deepEqual([restored.budget,restored.elapsed,restored.duration,restored.remaining,restored.reserve],[150,5,20,15,130]);
 const later=launch+23*60000;
 T.finish(state,state.matches[0].id,win,later);
 const ended=P.estimate(state,{actual:true,now:later+4*86400000});
 assert.deepEqual([ended.elapsed,ended.remaining,ended.reserve],[23,0,127]);
});
test('planner accepts a rental duration and starts the clock only when the draw is published',()=>{
 const state=field(2,'circle');
 const ui=boot({realState:state,hash:'#plan'});
 const input=ui.node('#plan-rental-minutes');
 input.dataset={planSetting:'rentalMinutes'};
 assert.match(ui.html(),/Длительность аренды/);
 assert.doesNotMatch(ui.html(),/data-plan-setting="(?:start|end)"/);
 ui.input('#plan-rental-minutes','2:70');
 assert.match(ui.node('#plan-overview').innerHTML,/Укажите количество кортов/);
 ui.input('#plan-rental-minutes','2:30');
 ui.click({action:'save-plan'});
 assert.equal(D.decode(ui.storage.get(D.key)).settings.rentalMinutes,150);
 ui.click({action:'draw'});
 assert.equal(D.decode(ui.storage.get(D.key)).startedAt,undefined);
 ui.run('gameNow=()=>1800000000000');
 ui.click({action:'publish-draw'});
 assert.equal(D.decode(ui.storage.get(D.key)).startedAt,1800000000000);
 assert.match(ui.html(),/Прошло 0 мин/);
});
test('requested court is assigned directly and score entry keeps manual values and a deciding game',()=>{
 const state=field(2,'circle');T.start(state);
 const ui=boot({realState:state}),id=state.matches[0].id;
 ui.click({action:'choose-match',court:'3'});
 assert.match(ui.node('#dialog').innerHTML,/data-action="assign-to-court" data-court="3"/);
 ui.click({action:'assign-to-court',id,court:'3'});
 assert.equal(ui.node('#dialog').open,false);assert.equal(ui.run('state.matches[0].court'),3);
 ui.click({action:'score',id});
 ui.input('#score-0-0','2');assert.equal(ui.node('#score-0-1').value,'');
 ui.input('#score-0-0','20');ui.enter('#score-0-0');assert.equal(ui.node('#score-0-1').value,'');
 ui.input('#score-0-1','22');ui.input('#score-0-0','12');ui.enter('#score-0-0');assert.equal(ui.node('#score-0-1').value,'22');
 ui.input('#score-0-1','');ui.enter('#score-0-0');assert.equal(ui.node('#score-0-1').value,'21');
 ui.input('#score-1-1','14');ui.enter('#score-1-1');assert.equal(ui.node('#score-1-0').value,'21');
 ui.input('#score-2-1','16');ui.enter('#score-2-1');assert.equal(ui.node('#score-2-0').value,'21');
 ui.input('#score-1-1','21');ui.input('#score-1-0','14');ui.enter('#score-1-0');
 assert.equal(ui.node('#score-2-0').disabled,true);assert.equal(ui.node('#score-2-1').value,'16');
 ui.input('#score-1-0','21');ui.input('#score-1-1','14');ui.enter('#score-1-1');
 assert.equal(ui.node('#score-2-0').disabled,false);assert.equal(ui.node('#score-2-1').value,'16');
 ui.click({action:'save-score'});
 assert.deepEqual(JSON.parse(ui.storage.get(D.key)).matches[0].scores,[[12,21],[21,14],[21,16]]);
});
test('planner saves a preset, publishes the previewed draw and shows all five category panels',()=>{
 const state=groups(12,4,'bronze');
 const ui=boot({realState:state,hash:'#plan'});
 assert.match(ui.html(),/Три сетки с бронзой/);assert.match(ui.html(),/<b>24<\/b> встреч/);
 ui.click({action:'plan-preset',id:'triple',index:'0'});ui.click({action:'save-plan'});
 ui.run('mutate(s=>{s.categories[0].seeding="random";})');ui.click({action:'draw'});
 const preview=ui.run('JSON.stringify(realDraft.next.drawOrders)');
 ui.click({action:'publish-draw'});assert.equal(ui.run('JSON.stringify(state.drawOrders)'),preview);
 assert.match(ui.html(),/Группы/);
 const saved=D.decode(ui.storage.get(D.key)),board=boot({realState:saved,hash:'#board'});
 assert.match(board.html(),/Группа A/);assert.match(board.html(),/за 1–4-е/i);
 board.click({action:'full-bracket',id:'md'});
 assert.match(board.node('#dialog').innerHTML,/Полуфинал/);
 const five=field(2,'circle');five.categories=structuredClone(T.divisions);
 five.entries=five.categories.flatMap(c=>[0,1].map(i=>({id:c.id+i,category:c.id,players:Array.from({length:c.doubles?2:1},(_,j)=>({name:'Имя '+c.id+i+j,rating:1000}))})));
 T.start(five);
 assert.equal((boot({realState:five,hash:'#board'}).html().match(/class="board-division"/g)||[]).length,5);
});
