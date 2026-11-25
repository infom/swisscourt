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
test('Swiss 2×15 awards half a point to both sides and ranks complete personal groups before coefficients',()=>{
 const draw=[[15,11],[10,15]],format=C.scoreFormats.two15Draw;
 assert.equal(C.validateScores(draw,{format}).winner,null);
 assert.equal(C.validateScores([[15,12],[12,15]],{format}).decidedBy,'draw');
 assert.equal(C.validateScores([[15,12],[15,13]],{format}).winner,0);
 assert.equal(C.validateScores([[15,12]],{format}).ok,false);
 assert.equal(C.validateScores(draw,{format:C.scoreFormats.two15}).winner,1);
 assert.throws(()=>T.start(field(2,'knockout',{scoreFormat:'two15Draw'})),/доступен в круговой и швейцарской/);
 const candidates=()=>['a','b','c'].map((id,i)=>({entry:{id},points:2,buchholz:i,berger:i}));
 const meeting=(a,b,scores)=>({a,b,scores,result:C.validateScores(scores,{format})});
 const games=[meeting('a','b',[[15,13],[15,13]]),meeting('a','c',[[15,13],[0,15]]),meeting('b','c',draw)];
 const rank=(rows,matches)=>C.rankStandings(rows,matches,true,true).map(r=>r.entry.id);
 assert.deepEqual(rank(candidates(),games),['a','c','b'],'personal game difference precedes rally difference and coefficients');
 assert.deepEqual(rank(candidates(),games.slice(0,2)),['c','b','a'],'incomplete groups start with the existing coefficients');
 assert.deepEqual(rank(candidates().slice(0,2),[meeting('b','a',draw)]),['a','b'],'personal rallies precede coefficients at 1:1');
 assert.deepEqual(rank(candidates().slice(0,2),[meeting('a','b',[[15,11],[11,15]])]),['b','a'],'equal personal rallies fall back to coefficients');
});
test('an eleven-pair Swiss event with draws plays five rounds and restores all results',()=>{
 const state=field(11,'swiss',{rounds:5,scoreFormat:'two15Draw'});T.start(state);
 for(let round=1;round<=5;round++){
  const matches=state.matches.filter(m=>m.round===round);
  assert.equal(matches.length,5);
  for(const [index,m] of matches.entries())play(state,m,(index+round)%3?[[15,10],[15,11]]:[[15,9],[12,15]]);
  T.validate(state);
  if(round<5)A.apply(state,A.plan(state,'md'));
 }
 const rows=T.standings(state,'md');
 assert.equal(rows.reduce((sum,row)=>sum+row.points,0),30);
 assert.equal(rows.reduce((sum,row)=>sum+row.draws,0),16);
 assert.ok(rows.every(row=>row.played===row.wins+row.draws+row.losses&&row.points===row.wins+row.draws/2+row.byes));
 assert.equal(new Set(state.byes.map(b=>b.entryId)).size,5);
 assert.equal(new Set(state.matches.map(m=>[m.a,m.b].sort().join('|'))).size,25);
 state.closed=true;assert.deepEqual(T.standings(D.decode(JSON.stringify(state)),'md'),rows);
});
test('the draw format is selectable in Swiss planning and renders a yellow result on both displays',()=>{
 const s=field(4,'swiss',{rounds:3,scoreFormat:'two15'}),{parse}=require('node-html-parser');
 const prepare=boot({realState:s,hash:'#tournament'});
 assert.ok(parse(prepare.html()).querySelector('[data-plan="scoreFormat"] option[value="two15Draw"]'));
 prepare.change({plan:'scoreFormat',index:'0'},'two15Draw');
 const configured=D.decode(prepare.storage.get(D.key));
 prepare.change({plan:'scheme',index:'0'},'circle');
 assert.equal(D.decode(prepare.storage.get(D.key)).categories[0].scoreFormat,'two15Draw');
 assert.ok(parse(prepare.html()).querySelector('[data-plan="scoreFormat"] option[value="two15Draw"]'));
 prepare.change({plan:'scheme',index:'0'},'knockout');
 assert.equal(D.decode(prepare.storage.get(D.key)).categories[0].scoreFormat,'two15');
 assert.equal(parse(prepare.html()).querySelector('[data-plan="scoreFormat"] option[value="two15Draw"]'),null);
 T.start(configured);
 const [m]=configured.matches;C.assign(configured,m.id,1);
 const ui=boot({realState:configured,hash:'#dashboard'});
 ui.click({action:'score',id:m.id});
 for(const [input,value] of [['0-0',15],['0-1',11],['1-0',10],['1-1',15]])ui.input('#score-'+input,value);
 assert.match(ui.node('#score-announcement').textContent,/Ничья 1:1 · По 0,5 очка/);
 assert.equal(ui.node('#score-team-0').classList.contains('match-loser'),false);
 assert.equal(ui.node('#score-team-1').classList.contains('match-draw'),true);
 ui.click({action:'save-score'});
 const saved=D.decode(ui.storage.get(D.key));
 assert.equal(saved.matches[0].status,'done');
 assert.equal(saved.matches[0].lotWinner,undefined);
 const [a,b]=[m.a,m.b].map(id=>T.standings(saved,'md').find(r=>r.entry.id===id));
 assert.deepEqual([a,b].map(r=>[r.points,r.wins,r.draws,r.losses,r.berger]),[[0.5,0,1,0,0.25],[0.5,0,1,0,0.25]]);
 assert.equal(b.place,1);
 ui.run('view="standings";render()');
 assert.equal(parse(ui.html()).querySelectorAll('button.game-result.draw').length,2);
 assert.match(ui.html(),/<strong>0,5<\/strong>/);
 ui.run('view="results";render()');
 assert.match(ui.html(),/result-row draw/);
 const board=boot({realState:saved,hash:'#board'});
 assert.equal(parse(board.html()).querySelectorAll('span.game-result.draw').length,2);
 const updated=structuredClone(saved);T.updateLiveCategory(updated,'md','scoreFormat','best15');
 assert.equal(C.matchResult(updated,updated.matches[0]).winner,null);
 assert.equal(T.standings(updated,'md').find(r=>r.entry.id===m.a).points,0.5);
});
test('circle draws score half in personal meetings and appear on the chessboard and exported protocol',async()=>{
 const s=field(2,'circle',{scoreFormat:'two15'}),{parse}=require('node-html-parser');
 T.start(s);
 const ui=boot({realState:s,hash:'#tournament'});
 ui.change({plan:'scoreFormat',index:'0'},'two15Draw');
 const configured=D.decode(ui.storage.get(D.key)),[match]=configured.matches;
 assert.equal(configured.categories[0].scoreFormat,'two15Draw');
 play(configured,match,[[15,11],[10,15]]);
 const rows=T.standings(D.decode(JSON.stringify(configured)),'md');
 assert.deepEqual(rows.map(r=>[r.entry.id,r.place,r.points,r.personalPoints,r.draws]),[[match.b,1,0.5,0.5,1],[match.a,2,0.5,0.5,1]]);
 const board=boot({realState:configured,hash:'#board'});
 assert.equal(parse(board.html()).querySelectorAll('table.chess-table .game-result.draw').length,2);
 assert.deepEqual(parse(board.html()).querySelectorAll('table.chess-table td.points-col').map(cell=>cell.text),['0,5','0,5']);
 configured.closed=true;
 const organizer=boot({realState:configured,hash:'#standings'});
 assert.match(organizer.html(),/title="Ничьи"/);
 organizer.click({action:'entry-stats',id:match.a});
 assert.match(organizer.node('#dialog').innerHTML,/Очки в личных встречах<\/dt><dd>0,5/);
 organizer.click({action:'export-protocol'});
 const [category]=JSON.parse(await organizer.downloads[0].text()).categories;
 assert.equal(category.matches[0].outcome,'draw');
 assert.deepEqual(category.standings.map(r=>r.personalPoints),[0.5,0.5]);
});
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
 delete circle.settings.restMinutes;
 assert.equal(P.estimate(T.validate(circle)).duration,90);
 circle.settings.restMinutes=10;
 assert.equal(P.estimate(circle).duration,80);
 circle.settings.restMinutes=0;
 assert.equal(P.estimate(circle).duration,60);
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
 assert.match(ui.node('#plan-overview').innerHTML,/Укажите число кортов/);
 ui.input('#plan-rental-minutes','2:30');
 assert.equal(D.decode(ui.storage.get(D.key)).settings.rentalMinutes,150);
 ui.run('view="participants";render()');ui.click({action:'prepare-draw'});ui.click({action:'draw'});
 assert.equal(D.decode(ui.storage.get(D.key)).startedAt,undefined);
 ui.run('gameNow=()=>1800000000000');
 ui.click({action:'publish-draw'});
 assert.equal(D.decode(ui.storage.get(D.key)).startedAt,1800000000000);
 assert.match(ui.html(),/Прошло 0:00/);
});
test('planner saves zero rest, recalculates the forecast and skips short-rest warnings',()=>{
 const state=field(4,'circle');
 state.settings.courts=2;
 const ui=boot({realState:state,hash:'#plan'});
 const input=ui.node('#plan-rest-minutes');input.dataset={planSetting:'restMinutes'};
 assert.match(ui.html(),/Отдых между играми/);
 assert.match(ui.html(),/1:30/);
 for(const invalid of ['','-1','2.5']){
  ui.input('#plan-rest-minutes',invalid);
  assert.match(ui.node('#plan-overview').innerHTML,/Укажите отдых целым числом/);
  assert.equal(D.decode(ui.storage.get(D.key)).settings.restMinutes,15);
 }
 ui.input('#plan-rest-minutes','0');
 assert.match(ui.node('#plan-overview').innerHTML,/1:00/);
 const saved=D.decode(ui.storage.get(D.key));
 assert.equal(saved.settings.restMinutes,0);
 const launch=1800000000000;
 T.start(saved,launch);
 const firstRound=saved.matches.filter(match=>match.round===1);
 for(const [index,match] of firstRound.entries())C.assign(saved,match.id,index+1,launch);
 for(const match of firstRound)T.finish(saved,match.id,win,launch+20*60000);
 const live=boot({realState:saved,hash:'#dashboard'});
 live.run('gameNow=()=>1800001200000;render()');
 const candidate=live.run('C.queue(state,gameNow()).find(match=>C.restMinutes(state,match,gameNow())===0)?.id');
 assert.ok(candidate);
 live.run('assignDialog('+JSON.stringify(candidate)+')');
 assert.doesNotMatch(live.node('#dialog').innerHTML,/Рекомендуемый отдых|activity-(critical|short)/);
 live.run('state.settings.restMinutes=10;assignDialog('+JSON.stringify(candidate)+')');
 assert.match(live.node('#dialog').innerHTML,/Рекомендуемый отдых · 10 мин/);
 assert.match(live.node('#dialog').innerHTML,/activity-critical/);
});
test('live Swiss round count follows actual roster and discards only unstarted extra rounds',()=>{
 const s=field(9,'swiss',{planned:4,rounds:3});T.start(s);
 const ui=boot({realState:s,hash:'#tournament'});
 ui.change({plan:'rounds',index:'0'},'5');
 const extended=D.decode(ui.storage.get(D.key));
 assert.equal(T.roundCount(extended,'md'),5);
 assert.equal(P.estimate(extended,{actual:true}).count,20);
 for(let round=1;round<=3;round++){
  for(const match of extended.matches.filter(m=>m.round===round))play(extended,match);
  A.apply(extended,A.plan(extended,'md'));
 }
 const running=structuredClone(extended);
 C.assign(running,running.matches.find(m=>m.round===4).id,1);
 assert.throws(()=>T.updateLiveCategory(running,'md','rounds',3),/уже вызваны/);
 const reduce=boot({realState:extended,hash:'#tournament'});
 reduce.change({plan:'rounds',index:'0'},'3');
 const saved=D.decode(reduce.storage.get(D.key));
 assert.equal(T.roundStatus(saved,'md').complete,true);
 assert.deepEqual(saved.matches,extended.matches.filter(m=>m.round<=3));
 assert.deepEqual(saved.byes,extended.byes.filter(b=>b.round<=3));
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
test('score entry uses the same keyboard path for all straight and deciding results',()=>{
 for(const losers of [[0,0],[1,1],[0,1,0],[1,0,0],[0,1,1],[1,0,1]]){
  const state=field(2,'circle');T.start(state);
  const match=state.matches[0];C.assign(state,match.id,1);
  const ui=boot({realState:state});ui.click({action:'score',id:match.id});
  let strokes=0;
  for(const [game,loser] of losers.entries()){
   assert.equal(ui.focused(),'#score-'+game+'-0');
   if(loser===1){assert.equal(ui.press('Enter'),true);strokes++;}
   assert.equal(ui.focused(),'#score-'+game+'-'+loser);
   ui.input(ui.focused(),'12');assert.equal(ui.press('Enter'),true);strokes++;
  }
  const upperWins=losers.filter(side=>side===1).length;
  const score=upperWins+':'+(losers.length-upperWins);
  assert.equal(strokes,{'0:2':2,'2:0':4,'1:2':4,'2:1':5}[score]);
  assert.equal(ui.focused(),'[data-action="save-score"]');
  ui.click({action:'save-score'});
  assert.deepEqual(JSON.parse(ui.storage.get(D.key)).matches[0].scores,losers.map(side=>side===0?[12,21]:[21,12]));
 }
});
test('vertical keys keep focus in the same game and a deuce requires both sides',()=>{
 const state=field(2,'circle');T.start(state);
 const match=state.matches[0];C.assign(state,match.id,1);
 const ui=boot({realState:state});ui.click({action:'score',id:match.id});
 assert.equal(ui.press('ArrowDown'),true);assert.equal(ui.focused(),'#score-0-1');
 assert.equal(ui.press('ArrowUp'),true);assert.equal(ui.focused(),'#score-0-0');
 assert.equal(ui.node('#score-0-0').value,'');assert.equal(ui.node('#score-0-1').value,'');
 ui.input('#score-0-0','20');ui.press('Enter');assert.equal(ui.focused(),'#score-0-1');
 ui.input('#score-0-1','21');ui.press('Enter');assert.equal(ui.focused(),'#score-0-1');
 assert.match(ui.node('#score-error').textContent,/партии 1/);
 ui.input('#score-0-1','22');ui.press('Enter');assert.equal(ui.focused(),'#score-1-0');
});
test('Enter completes scores two below the target in every format, including a decider to 11',()=>{
 for(const [scoreFormat,format] of Object.entries(C.scoreFormats)){
  const state=format.allowsDraw?field(4,'swiss',{scoreFormat,rounds:3}):field(2,'circle',{scoreFormat});T.start(state);
  const match=state.matches[0];C.assign(state,match.id,1);
  const ui=boot({realState:state});ui.click({action:'score',id:match.id});
  const losers=scoreFormat==='shortFinal'?[0,1,0]:[0,0];
  const scores=[];
  for(const [index,loser] of losers.entries()){
   const goal=format.targets[index],input='#score-'+index+'-'+loser,opponent='#score-'+index+'-'+(1-loser);
   assert.equal(ui.focused(),'#score-'+index+'-0');
   if(loser===1)ui.press('Enter');
   ui.input(input,goal-2);
   assert.equal(ui.node(opponent).value,'');
   assert.equal(ui.press('Enter'),true);
   assert.equal(ui.node(opponent).value,String(goal));
   scores.push(loser===0?[goal-2,goal]:[goal,goal-2]);
  }
  assert.equal(ui.focused(),'[data-action="save-score"]');
  ui.click({action:'save-score'});
  assert.deepEqual(D.decode(ui.storage.get(D.key)).matches[0].scores,scores);
 }
});
test('extended games immediately suggest a legal winning score and respect manual overrides',()=>{
 const state=field(2,'circle',{scoreFormat:'best15'});T.start(state);
 const match=state.matches[0];C.assign(state,match.id,1);
 const ui=boot({realState:state});ui.click({action:'score',id:match.id});
 const first='#score-0-0',opponent='#score-0-1';
 for(const [entered,expected] of [[16,'18'],[19,'21'],[20,'21'],[21,''],[22,''],[19,'21'],['','']]){
  ui.input(first,entered);
  assert.equal(ui.node(opponent).value,expected);
  assert.equal(ui.focused(),first);
 }
 ui.input(first,16);
 ui.input(opponent,19);
 ui.input(first,17);
 assert.equal(ui.node(opponent).value,'19');
 assert.equal(ui.press('Enter'),true);
 assert.equal(ui.focused(),'#score-1-0');
});
test('planner saves a preset, publishes the previewed draw and shows all five category panels',()=>{
 const state=groups(12,4,'bronze');
 const ui=boot({realState:state,hash:'#plan'});
 assert.match(ui.html(),/Три сетки с бронзой/);assert.match(ui.html(),/<strong>24<\/strong><small>Игр всего/);
 ui.change({plan:'preset',index:'0'},'triple');
 ui.run('view="participants";render()');ui.click({action:'prepare-draw'});ui.click({action:'draw'});
 const preview=ui.run('JSON.stringify(realDraft.next.drawOrders)');
 ui.click({action:'publish-draw'});assert.equal(ui.run('JSON.stringify(state.drawOrders)'),preview);
 assert.match(ui.html(),/Группы/);
 const saved=D.decode(ui.storage.get(D.key)),board=boot({realState:saved,hash:'#board'});
 assert.match(board.html(),/Группа 1/);assert.match(board.html(),/за 1–4-е/i);
 assert.match(board.html(),/Шахматка · Группа 1/);assert.doesNotMatch(board.html(),/data-action=|<button/);
 restoredBracket(saved);
 const five=field(2,'circle');five.categories=structuredClone(T.divisions.slice(0,5));
 five.entries=five.categories.flatMap(c=>[0,1].map(i=>({id:c.id+i,category:c.id,players:Array.from({length:c.doubles?2:1},(_,j)=>({name:'Имя '+c.id+i+j,rating:1000}))})));
 T.start(five);
 assert.equal((boot({realState:five,hash:'#board'}).html().match(/class="board-division"/g)||[]).length,5);
});
function restoredBracket(saved){
 const organizer=boot({realState:saved,hash:'#standings'});
 organizer.click({action:'full-bracket',id:'md'});
 assert.match(organizer.node('#dialog').innerHTML,/Полуфинал за 1-е место/);
}
test('group routes apply across uneven groups and standings follow the bracket places',()=>{
 const state=field(7,'groups',{groupCount:2,routes:[1,1,2,2],playoffs:[{mode:'bronze'},{mode:'single'}]});
 const category=state.categories[0];
 assert.deepEqual(B.groupPlayoffs(category,7).map(bracket=>bracket.slots.length),[4,3]);
 assert.equal(P.estimate(state).count,15);
 playAll(state);
 const context=T.bracketContext(state,'md');
 const rows=T.standings(state,'md');
 assert.deepEqual(rows.map(row=>row.place),[1,2,3,4,5,6,7]);
 for(const bracket of context.brackets){
  for(const p of bracket.places)assert.equal(rows.find(row=>row.entry.id===context.resolve(p.ref)).place,p.place);
 }
 const fifth=context.nodes.find(node=>node.forPlace===5&&node.stage==='Финал');
 const organizer=boot({realState:state,hash:'#standings'});
 organizer.click({action:'match-details',id:fifth.id});
 assert.match(organizer.node('#dialog').innerHTML,/Игра за 5-е место/);
 assert.match(organizer.node('#dialog').innerHTML,/result-winner/);
 assert.match(organizer.node('#dialog').innerHTML,/result-loser/);
 assert.doesNotMatch(organizer.node('#dialog').innerHTML,/>Победа:|Тур [0-9]/u);
});
test('a free court offers all four known group games even with an earlier game pending',()=>{
 const state=field(6,'groups',{groupCount:2,routes:[1,0,0],playoffs:[{mode:'single'}]});T.start(state);
 for(const match of state.matches.filter(match=>match.round===1))play(state,match);
 const {parse}=require('node-html-parser'),ui=boot({realState:state});
 const courtDialog=()=>parse(ui.node('#dialog').innerHTML);
 ui.click({action:'choose-match',court:'3'});
 assert.equal(courtDialog().querySelectorAll('[data-action="assign-to-court"]').length,4);
 for(const group of [0,1]){
  const match=state.matches.find(match=>match.round===3&&match.group===group);
  ui.click({action:'assign-to-court',id:match.id,court:String(3+group)});
 }
 assert.equal(D.decode(ui.storage.get(D.key)).matches.filter(match=>match.status==='playing').length,2);
 ui.click({action:'choose-match',court:'5'});
 assert.match(courtDialog().text,/Нет доступных встреч/);
 assert.doesNotMatch(courtDialog().text,/Ожидает|ФАМИЛИЯ/);
});
test('after two of seven round-robin rounds the court offers all twenty remaining matches',()=>{
 const state=field(8,'circle');state.settings.courts=4;T.start(state);
 for(const match of state.matches.filter(match=>match.round<=2))play(state,match);
 const {parse}=require('node-html-parser'),ui=boot({realState:state,hash:'#dashboard'});
 ui.click({action:'choose-match',court:'2'});
 const games=parse(ui.node('#dialog').innerHTML).querySelectorAll('[data-action="assign-to-court"]');
 assert.equal(games.length,20);
 assert.equal(games[0].getAttribute('data-id'),state.matches.find(match=>match.round===3).id);
 const later=state.matches.find(match=>match.round===7);
 assert.ok(games.some(button=>button.getAttribute('data-id')===later.id));
 ui.click({action:'assign-to-court',id:later.id,court:'2'});
 const saved=D.decode(ui.storage.get(D.key));
 assert.equal(saved.matches.find(match=>match.id===later.id).court,2);
 assert.equal(saved.matches.filter(match=>match.status==='done').length,8);
});
test('a seven-player bracket keeps the bye in place and connects the final and bronze to their semifinals',()=>{
 const state=field(7,'knockout',{bracketMode:'bronze'});T.start(state);
 const {parse}=require('node-html-parser'),ui=boot({realState:state,hash:'#standings'});
 ui.click({action:'full-bracket',id:'md'});
 const stages=parse(ui.node('#dialog').innerHTML).querySelectorAll('.bracket-stage');
 assert.equal(stages.length,3);
 assert.equal(stages[0].querySelectorAll('.bracket-card').length,4);
 assert.match(stages[0].querySelector('.bracket-card').text,/Пропуск/);
 assert.equal(stages[1].querySelectorAll('.bracket-edge').length,4);
 assert.equal(stages[2].querySelectorAll('.bracket-edge').length,4);
 assert.equal(stages[2].querySelectorAll('.loser-path').length,2);
 assert.match(stages[2].text,/Игра за 3-е место/);
 const board=parse(boot({realState:state,hash:'#board'}).html());
 assert.equal(board.querySelectorAll('.bracket-stage').length,2);
 assert.equal(board.querySelectorAll('button').length,0);
});
test('two circle legs are counted and played through the same plan, reversing sides',()=>{
 const state=field(5,'circle',{circles:2});
 assert.equal(P.estimate(state).count,20);
 playAll(state);
 assert.equal(T.roundCount(state,'md'),10);
 const first=state.matches.filter(match=>match.round<=5);
 const second=state.matches.filter(match=>match.round>5);
 assert.equal(second.length,first.length);
 for(const match of first)assert.ok(second.some(other=>other.a===match.b&&other.b===match.a&&other.round===match.round+5));
});
test('seven Swiss rounds keep every result visible on the passive scoreboard',()=>{
 const state=field(8,'swiss',{rounds:7});
 playAll(state);
 assert.equal(state.matches.length,28);
 assert.equal(new Set(state.matches.map(match=>[match.a,match.b].sort().join('/'))).size,28);
 const {parse}=require('node-html-parser');
 const board=parse(boot({realState:state,hash:'#board'}).html());
 const progress=board.querySelectorAll('.game-progress');
 assert.equal(progress.length,8);
 assert.ok(progress.every(row=>row.querySelectorAll('.game-result').length===7));
});
test('passive scoreboard has seven court cards, a chess table and the complete short score',()=>{
 const state=field(4,'circle');T.start(state);
 const [played,live]=state.matches.filter(match=>match.round===1);
 play(state,played,[[18,21],[21,19],[24,22]]);
 C.assign(state,live.id,7);
 const {parse}=require('node-html-parser');
 const board=parse(boot({realState:state,hash:'#board'}).html());
 assert.equal(board.querySelectorAll('.board-court').length,7);
 assert.equal(board.querySelectorAll('.board-court-pair').length,2);
 assert.equal(board.querySelector('.board-court-division small').text,'Тур 1');
 assert.equal(board.querySelector('.board-division-heading .board-division-counts').text,'1 сыграно5 осталось');
 assert.equal(board.querySelectorAll('.chess-table .game-result.playing').length,2);
 assert.deepEqual(board.querySelectorAll('.chess-table .game-result.deciding .block-score').map(el=>el.text).sort(),['18;−19;−22','−18;19;22'].sort());
 assert.equal(board.querySelectorAll('button, [data-action]').length,0);
});
test('round-robin scoreboard sorts the chess matrix by standings and shows shared places on the left',()=>{
 const state=field(4,'circle');
 for(const participant of state.entries)for(const player of participant.players)player.rating=1000;
 T.start(state);
 const winner=state.drawOrders.md.at(-1);
 const match=state.matches.find(match=>[match.a,match.b].includes(winner));
 play(state,match,match.a===winner?win:lose);
 const standings=T.standings(state,'md'),opponent=match.a===winner?match.b:match.a;
 assert.equal(standings[0].entry.id,winner);
 const {parse}=require('node-html-parser'),board=parse(boot({realState:state,hash:'#board'}).html());
 const table=board.querySelector('.chess-ranked'),rows=table.querySelectorAll('tbody tr');
 assert.equal(table.querySelector('thead .chess-number').text,'Место');
 assert.deepEqual(rows.map(row=>row.querySelector('.chess-number').text),['1','2=','2=','4']);
 const opponents=table.querySelectorAll('thead th').slice(2,-1);
 for(const [index,row] of rows.entries()){
  const id=standings[index].entry.id;
  assert.equal(opponents[index].getAttribute('aria-label'),(index+1)+' · '+C.entryLabel(state,id));
  assert.deepEqual(row.querySelectorAll('.team-names span').map(name=>name.text),standings[index].entry.players.map(player=>C.playerLabel(state,player)));
  assert.ok(row.children[index+2].classList.contains('chess-self'));
 }
 const column=standings.findIndex(row=>row.entry.id===opponent)+2;
 assert.equal(rows[0].children[column].querySelector('.block-score').text,'15;17');
});
