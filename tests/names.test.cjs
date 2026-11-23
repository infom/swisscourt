const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/core.js'),T=require('../app/tournament.js'),D=require('../app/storage.js');
const {boot}=require('./ui-harness.cjs');
function day(){
 const s=T.newDay();s.categories=s.categories.filter(c=>c.id==='wd');
 s.entries=[{id:'one',category:'wd',players:[{name:'Мария Чернова',surname:'Чернова',givenName:'Мария',sourceId:'import:1',rating:1500},{name:'Анна Белова',rating:1400}]},
  {id:'two',category:'wd',players:[{name:'Юлия Чернова',rating:1300},{name:'Елена Морозова',rating:1200}]}];return s;
}
function edit(ui,id=''){
 ui.click({action:'edit-entry',id});ui.node('#entry-form').dataset={id};ui.node('#entry-category').value='wd';
}

test('full names put surname first for imported and legacy players without changing saved identities',()=>{
 const s=day(),before=JSON.stringify(s);
 assert.deepEqual(s.entries.flatMap(e=>e.players).map(C.playerFullName),['Чернова Мария','Белова Анна','Чернова Юлия','Морозова Елена']);
 assert.equal(C.playerFullName({name:'Анна Мария Петрова'}),'Петрова Анна Мария');
 assert.equal(C.playerFullName({name:'Анна Де Соуза',surname:'Де Соуза',givenName:'Анна'}),'Де Соуза Анна');
 assert.equal(C.playerFullName(undefined),'');assert.equal(JSON.stringify(s),before);
 assert.deepEqual(D.decode(before),s);
});

test('compact labels show unique surnames and enough given-name letters to distinguish namesakes across divisions',()=>{
 const s=day();assert.deepEqual(s.entries.flatMap(e=>e.players).map(p=>C.playerLabel(s,p)),['ЧЕРНОВА М','БЕЛОВА','ЧЕРНОВА Ю','МОРОЗОВА']);
 const players=[{name:'Алексей Семёнов'},{name:'Андрей Семенов'},{name:'Борис Семёнов'}];
 const mixed={entries:players.map((p,i)=>({id:String(i),category:i?'md':'xd',players:[p]}))};
 assert.deepEqual(players.map(p=>C.playerLabel(mixed,p)),['СЕМЁНОВ АЛ','СЕМЕНОВ АН','СЕМЁНОВ Б']);
});

test('surname-first entry and repeated editing preserve name parts, import identity and backup compatibility',()=>{
 const ui=boot({realState:day()});edit(ui,'one');
 assert.equal(ui.node('#player-0').value,'Чернова Мария');assert.equal(ui.node('#player-1').value,'Белова Анна');
 ui.node('#rating-0').value='1600';ui.click({action:'save-entry'});
 let saved=D.decode(ui.storage.get(D.key));assert.equal(saved.entries[0].players[0].sourceId,'import:1');assert.equal(saved.entries[0].players[0].name,'Мария Чернова');
 edit(ui);ui.node('#player-0').value='Иванова Анна Мария';ui.node('#player-1').value='Петрова Вера';
 ui.node('#rating-0').value='1000';ui.node('#rating-1').value='1100';ui.click({action:'save-entry'});
 saved=D.decode(ui.storage.get(D.key));const added=saved.entries.at(-1);assert.equal(saved.entries.length,3);
 assert.equal(added.players[0].surname,'Иванова');assert.equal(added.players[0].givenName,'Анна Мария');
 const restored=boot({realState:saved});edit(restored,added.id);assert.equal(restored.node('#player-0').value,'Иванова Анна Мария');
 restored.click({action:'save-entry'});assert.equal(D.decode(restored.storage.get(D.key)).entries.at(-1).players[0].name,'Анна Мария Иванова');
});

test('surname-first manual input still rejects duplicates from imported and legacy entries',()=>{
 for(const name of ['Чернова Мария','Белова Анна']){
  const ui=boot({realState:day()});edit(ui);ui.node('#player-0').value=name;ui.node('#player-1').value='Петрова Вера';
  ui.node('#rating-0').value='1000';ui.node('#rating-1').value='1100';ui.click({action:'save-entry'});
  assert.match(ui.node('#entry-error').textContent,/уже есть/);assert.equal(ui.run('state.entries.length'),2);
 }
});

test('roster, search, removal, import preview and the protocol consistently use surname then given name',async()=>{
 const s=day(),ui=boot({realState:s});ui.run('view="participants";render()');
 assert.match(ui.html(),/Чернова Мария/);assert.doesNotMatch(ui.html(),/Мария Чернова/);
 ui.run('query="чернова мария";render()');assert.match(ui.html(),/Показано: 1/);
 ui.run('lookupQuery="чернова мария"');assert.match(ui.run('lookupResults()'),/ЧЕРНОВА М/);assert.doesNotMatch(ui.run('lookupResults()'),/не найден/);
 ui.click({action:'remove-entry',id:'one'});assert.match(ui.node('#dialog').innerHTML,/Чернова Мария/);
 ui.click({action:'import'});
 ui.run('globalThis.fetch=async()=>({ok:true,json:async()=>('+JSON.stringify({name:'Женский парный',code:'WD',entries:s.entries,warnings:[]})+')})');
 await ui.run('fetchImport("https://example.test/category")');assert.match(ui.node('#dialog').innerHTML,/Чернова Мария/);assert.doesNotMatch(ui.node('#dialog').innerHTML,/Мария Чернова/);
 T.start(s);C.assign(s,s.matches[0].id,1);T.finish(s,s.matches[0].id,[[21,12],[21,14]]);s.closed=true;
 const finished=boot({realState:s,hash:'#standings'});finished.click({action:'export-protocol'});
 const protocol=JSON.parse(await finished.downloads[0].text());
 assert.deepEqual(protocol.categories[0].participants[0].players.map(p=>p.name),['Чернова Мария','Белова Анна']);
});

test('queue, courts, score entry, results and scoreboard only show compact player names',()=>{
 const s=day();T.start(s);const ui=boot({realState:s});
 function compact(html){for(const label of ['ЧЕРНОВА М','ЧЕРНОВА Ю','БЕЛОВА','МОРОЗОВА'])assert.ok(html.includes(label),label);assert.doesNotMatch(html,/МАРИЯ|ЮЛИЯ|АННА|ЕЛЕНА|Мария|Юлия|Анна|Елена/);}
 compact(ui.html());
 ui.run('mutate(s=>C.assign(s,s.matches[0].id,1))');compact(ui.html());
 ui.run('scoreDialog(state.matches[0].id)');compact(ui.node('#dialog').innerHTML);
 ui.run('mutate(s=>T.finish(s,s.matches[0].id,[[21,15],[21,17]]))');
 ui.run('matchDetails(state.matches[0].id,state.matches[0].a)');compact(ui.node('#dialog').innerHTML);
 const saved=D.decode(ui.storage.get(D.key)),board=boot({realState:saved,hash:'#board'});compact(board.html());
});
