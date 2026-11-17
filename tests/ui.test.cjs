const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./ui-harness.cjs');
const T=require('../app/tournament.js'),D=require('../app/storage.js');
function day(n=8){const s=T.newDay();s.categories=s.categories.filter(c=>c.id==='md');for(let i=0;i<n;i++)s.entries.push({id:'e'+i,category:'md',players:[0,1].map(j=>({name:'Имя Фамилия'+i+j,rating:1000+i*20+j}))});return s;}
test('real application starts with empty persisted day and approved court/table design',()=>{
 const ui=boot();assert.equal(ui.run('mode'),'real');assert.equal(ui.run('state.entries.length'),0);assert.equal(ui.run('editorReady'),true);
 assert.ok(ui.storage.has(D.key));assert.match(ui.html(),/v1.0.0/);assert.ok(!ui.html().includes('ЭСКИЗ'));
 ui.run('view="settings";render()');assert.match(ui.html(),/Резервная копия/);assert.match(ui.html(),/Выбрать разряды/);
});
test('real UI starts odd field, publishes next round and retains entered scores after reopening',()=>{
 const ui=boot({realState:day(9)});ui.click({action:'draw'});assert.match(ui.node('#dialog').innerHTML,/Пропускает тур/);
 ui.click({action:'publish-draw'});assert.equal(ui.run('state.started'),true);assert.equal(ui.run('state.byes.length'),1);
 ui.run('for(const m of state.matches){C.assign(state,m.id,1);T.finish(state,m.id,[[21,15],[21,17]]);}persist(state);render()');
 assert.match(ui.html(),/Сформировать тур 2/);ui.click({action:'next-round',id:'md'});assert.match(ui.node('#dialog').innerHTML,/Тур 2/);ui.click({action:'publish-draw'});
 const saved=JSON.parse(ui.storage.get(D.key)),restored=boot({realState:saved});assert.equal(restored.run('state.matches.length'),8);assert.equal(restored.run('state.matches.filter(m=>m.status==="done").length'),4);assert.equal(restored.run('state.byes.length'),2);
});
test('another organizer tab is read-only and cannot overwrite the active day',()=>{
 const s=day(),ui=boot({realState:s,lock:false});assert.equal(ui.run('editorReady'),false);assert.match(ui.html(),/другой вкладке/);
 ui.click({action:'draw'});ui.click({action:'publish-draw'});assert.equal(ui.run('state.started'),false);assert.deepEqual(JSON.parse(ui.storage.get(D.key)),s);
});
test('scoreboard is read-only and gets the real day with coefficients',()=>{
 const s=day();T.start(s);const ui=boot({realState:s,hash:'#board'});assert.match(ui.html(),/>Соперники<\/th>/);assert.match(ui.html(),/ТУРНИР ИДЁТ/);
 assert.equal(ui.run('mutate(s=>s.settings.title="bad")'),false);assert.equal(ui.run('state.settings.title'),s.settings.title);
});
test('new day replacement and backup are explicit; demo remains separate',()=>{
 const s=day(),ui=boot({realState:s});ui.click({action:'new-day'});assert.equal(ui.run('state.entries.length'),8);assert.match(ui.node('#dialog').innerHTML,/Скачать копию/);
 ui.click({action:'backup'});assert.equal(ui.downloads.length,1);
 ui.click({action:'confirm-new-day'});assert.equal(ui.run('state.entries.length'),0);assert.notEqual(ui.run('state.id'),s.id);
 const demo=boot({search:'?scenario=live',realState:s});assert.equal(demo.run('state.entries.length'),24);assert.deepEqual(JSON.parse(demo.storage.get(D.key)),s);
});
test('CSV treats imported spreadsheet formulas as literal player names',async()=>{
 const s=day();s.entries[0].players[0].name='=HYPERLINK(1) Иванов';const ui=boot({realState:s});ui.click({action:'export'});
 assert.match(await ui.downloads[0].text(),/"'=HYPERLINK\(1\) Иванов"/);
});
