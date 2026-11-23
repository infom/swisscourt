const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),T=require('../app/tournament.js'),A=require('../app/scheduling.js'),D=require('../app/storage.js');
const Protocol=require('../app/protocol.js'),{boot}=require('./ui-harness.cjs');
const {version}=require('../package.json');
const started=Date.parse('2026-11-24T10:00:00Z');

function addField(state,index,config){
 const category={...state.categories[index],scoreFormat:'classic',...config};
 state.categories[index]=category;
 for(let i=0;i<category.planned;i++)state.entries.push({id:category.id+'-p'+i,category:category.id,players:[
  {name:'Игрок Первый'+category.id+i,rating:1200-i,sourceId:'private-source-id-'+category.id+i},
  {name:'Игрок Второй'+category.id+i,rating:null}
 ]});
}
function play(state,match,court=1,scores=[[21,15],[21,17]]){
 const now=started+state.matches.filter(m=>m.status==='done').length*20*60000;
 C.assign(state,match.id,court,now);T.finish(state,match.id,scores,now+15*60000);
}

test('the downloadable protocol covers every category in a closed day and keeps historical court and call times',async()=>{
 const s=T.newDay();
 addField(s,0,{planned:2,scheme:'circle'});
 addField(s,1,{planned:2,scheme:'circle'});
 s.entries[0].leagueSource='3/start/MD';
 s.entries[0].players[0].name='Иван =HYPERLINK(1)';
 T.start(s,started);
 const before=boot({realState:s,hash:'#standings'});
 assert.doesNotMatch(before.html(),/Скачать протокол тура/);
 before.click({action:'export-protocol'});assert.equal(before.downloads.length,0);
 play(s,s.matches[0],7);
 T.finish(s,s.matches[0].id,[[21,13],[21,14]],started+60000*120);
 s.settings.courts=2;
 play(s,s.matches[1]);
 delete s.matches[1].startedAt;delete s.matches[1].playedCourt;
 s.closed=true;
 const ui=boot({realState:D.decode(JSON.stringify(s)),hash:'#standings'});
 assert.match(ui.html(),/Скачать протокол тура/);assert.doesNotMatch(ui.html(),/CSV/);
 ui.click({action:'export-protocol'});
 const content=await ui.downloads[0].text(),protocol=JSON.parse(content);
 assert.equal(ui.downloads[0].type,'application/json;charset=utf-8');
 assert.equal(protocol.kind,'swisscourt.tour-protocol');assert.equal(protocol.schemaVersion,1);
 assert.deepEqual(protocol.producer,{name:'SwissCourt',version});
 assert.deepEqual(protocol.event.league,{tour:3,level:'start'});
 assert.deepEqual(protocol.categories.map(c=>c.code),['MD','WD']);
 const [md,wd]=protocol.categories;
 assert.equal(md.participants[0].players[0].name,'=HYPERLINK(1) Иван');
 assert.equal(md.participants[0].players[1].rating,null);
 assert.equal(md.standings[0].place,1);
 assert.deepEqual(md.matches[0].scores,[[21,13],[21,14]]);
 assert.deepEqual([md.matches[0].court,md.matches[0].calledAt,md.matches[0].resultRecordedAt,md.matches[0].secondsFromCallToResult],
  [7,'2026-11-24T10:00:00.000Z','2026-11-24T10:15:00.000Z',900]);
 assert.deepEqual([wd.matches[0].court,wd.matches[0].calledAt,wd.matches[0].secondsFromCallToResult],[null,null,null]);
 assert.doesNotMatch(content,/private-source-id|"history"|"leagueSource"/);
});

test('the protocol preserves Swiss draws, byes and exact standings',()=>{
 const s=T.newDay();s.categories=s.categories.slice(0,1);
 addField(s,0,{planned:5,scheme:'swiss',rounds:3,scoreFormat:'two15Draw'});
 T.start(s,started);
 for(let round=1;round<=3;round++){
  for(const match of s.matches.filter(m=>m.round===round))play(s,match,1,[[15,11],[10,15]]);
  if(round<3)A.apply(s,A.plan(s,'md'));
 }
 s.closed=true;
 const category=Protocol.create(D.decode(JSON.stringify(s)),version).categories[0];
 assert.equal(category.byes.length,3);assert.ok(category.byes.every(bye=>bye.points===1));
 assert.equal(category.matches.length,6);
 assert.ok(category.matches.every(m=>m.outcome==='draw'&&m.winnerId===null&&m.scoreFormat.id==='two15Draw'));
 assert.ok(category.standings.some(row=>row.points%1===0.5));
 assert.deepEqual(category.standings.map(r=>[r.participantId,r.place,r.sharedPlace,r.points]),
  T.standings(s,'md').map(r=>[r.entry.id,r.place,r.tied,r.points]));
});

test('the protocol includes group tables and connections between playoff matches',()=>{
 const s=T.newDay();s.categories=s.categories.slice(0,1);
 addField(s,0,{planned:8,scheme:'groups',groupCount:2,playoffs:[{mode:'bronze'}],routes:[1,1,0,0]});
 T.start(s,started);
 while(C.queue(s).length)play(s,C.queue(s)[0]);
 s.closed=true;
 const category=Protocol.create(D.decode(JSON.stringify(s)),version).categories[0];
 assert.deepEqual(category.groups.map(g=>[g.number,g.participantIds.length,g.standings.length]),[[1,4,4],[2,4,4]]);
 assert.equal(category.brackets.length,1);assert.equal(category.matches.length,16);
 const bracket=category.brackets[0],byId=new Map(bracket.matches.map(m=>[m.matchId,m]));
 assert.equal(bracket.matches.length,4);assert.ok(bracket.places.every(place=>place.participantId));
 assert.ok(bracket.matches.some(m=>m.slots.every(slot=>slot.outcome==='winner'&&byId.has(slot.match))));
 assert.ok(bracket.matches.some(m=>m.slots.every(slot=>slot.outcome==='loser'&&byId.has(slot.match))));
});
