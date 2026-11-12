// Offline view checks: execute the real renderer without a browser or network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('./core.js');
const legacyDay=require('./fixtures/legacy-day.cjs');
const script=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');

function boot({hash='',savedState,legacyState}={}){
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',scrollTop:0,value:'',open:false,disabled:false,textContent:'',classList:{add(){},remove(){}},focus(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});
  return nodes.get(id);
 };
 const storage=new Map(savedState?[['swisscourt-ui-md-wd-7-v1-live',JSON.stringify(savedState)]]:[]);
 if(legacyState)storage.set('swisscourt-ui-v1-live',JSON.stringify(legacyState));
 const context=vm.createContext({
  SwissCourtCore:C,structuredClone,URLSearchParams,URL,console,Date,
  location:{hash,search:'',href:'http://localhost/#'+hash},history:{replaceState(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),addEventListener(){}},
  window:{addEventListener(){},scrollTo(){}},setInterval(){},setTimeout(){},clearTimeout(){}
 });
 vm.runInContext(script,context);
 return {run:code=>vm.runInContext(code,context),html:()=>node('#app').innerHTML,node,storage};
}

test('court rail stays in the same place across all organizer views',()=>{
 const ui=boot();let rail;
 for(const view of ['dashboard','standings','results','participants','settings']){
  ui.run('view='+JSON.stringify(view)+';render()');
  const html=ui.html(),current=html.match(/<section class="courts-dock"[\s\S]*?<\/section>/)[0];
  if(rail)assert.equal(current,rail);else rail=current;
  assert.equal((current.match(/<article class="court /g)||[]).length,7);
  assert.ok(html.indexOf('courts-dock')<html.indexOf('workspace-nav'));
  assert.ok(html.includes('id="player-lookup"'));
 }
});

test('board simultaneously renders every entry of one, two or three divisions',()=>{
 for(const count of [1,2,3]){
  const state=legacyDay();state.categories=state.categories.slice(0,count);
  state.entries=state.entries.filter(e=>state.categories.some(c=>c.id===e.category));
  state.matches=state.matches.filter(m=>state.categories.some(c=>c.id===m.category));
  const ui=boot({hash:'#board',savedState:state}),html=ui.html();
  assert.equal((html.match(/<section class="board-division"/g)||[]).length,count);
  assert.equal((html.match(/<td class="standings-names">/g)||[]).length,state.entries.length);
  assert.ok(html.indexOf('board-tables')<html.indexOf('board-next'));
  assert.ok(html.indexOf('board-next')<html.indexOf('board-current'));
  assert.ok(!html.includes('data-action="category"'));
  assert.ok(!html.includes('Алексей Соколов'));
 }
});

test('queue keeps blocked games with explicit reasons and disables their calls',()=>{
 const ui=boot({savedState:legacyDay()}),html=ui.html();
 const queued=ui.run('state.matches.filter(m=>m.status==="queued").length');
 assert.equal((html.match(/<article class="queue-row /g)||[]).length,queued);
 assert.match(html,/играет на корте 3/);
 assert.match(html,/Тур 3 не завершён/);
 const row=ui.run('queueRow(C.queueItems(state).find(m=>!C.matchAvailability(state,m).available),0)');
 assert.match(row,/data-action="assign"[^>]*disabled/);
 assert.match(row,/data-action="pin"[^>]*disabled/);
});

test('surname initials and shared VS separator reach cards, dialogs, results and lookup',()=>{
 const ui=boot();assert.match(ui.html(),/ЧЕРНОВА М/);assert.match(ui.html(),/ЧЕРНОВА Ю/);
 ui.run('scoreDialog(state.matches.find(m=>m.status==="playing").id)');
 const score=ui.node('#dialog').innerHTML;
 assert.match(score,/class="versus" aria-label="против">VS/);
 assert.ok(!score.includes('Алексей Соколов'));
 ui.run('assignDialog(C.queue(state)[0].id,7)');
 assert.match(ui.node('#dialog').innerHTML,/class="versus" aria-label="против">VS/);
 ui.run('lookupQuery="Чернова"');const lookup=ui.run('lookupResults()');
 assert.equal((lookup.match(/class="lookup-result"/g)||[]).length,2);
 assert.match(lookup,/Сейчас на корте 4/);
 assert.match(lookup,/ЧЕРНОВА М/);assert.match(lookup,/ЧЕРНОВА Ю/);
 ui.run('view="results";render()');
 assert.ok(!ui.html().includes('Алексей Соколов'));
 assert.match(ui.html(),/class="versus" aria-label="против">VS/);
 ui.run('view="participants";render()');assert.match(ui.html(),/Алексей Соколов/);
});

test('loading saved round-robin data preserves results and generates no duplicate rounds',()=>{
 const state=legacyDay();state.matches=state.matches.filter(m=>!m.id.startsWith('rr-'));
 const originals=structuredClone(state.matches);
 const ui=boot({savedState:state});
 const after=JSON.parse(ui.run('JSON.stringify(state.matches.filter(m=>!m.id.startsWith("rr-")))'));
 assert.deepEqual(after,originals);
 assert.equal(ui.run('state.matches.filter(m=>m.category==="ws").length'),15);
 assert.equal(JSON.parse(ui.storage.get('swisscourt-ui-md-wd-7-v1-live')).matches.length,originals.length);
});

test('new primary scenario overrides the old default without overwriting old storage',()=>{
 const legacy=legacyDay(),ui=boot({legacyState:legacy});
 assert.equal(ui.run('state.settings.courts'),7);
 assert.equal(ui.run('state.categories.map(c=>c.code).join(",")'),'MD,WD');
 assert.equal(ui.run('selectedCategory'),'md');
 assert.deepEqual(JSON.parse(ui.storage.get('swisscourt-ui-v1-live')),legacy);
 assert.match(ui.html(),/data-court="7"/);
 assert.match(ui.html(),/--division-count:2/);
 ui.run('view="standings";render()');assert.match(ui.html(),/CSV · MD/);
 ui.run('switchScenario("prep");editEntryDialog()');
 assert.equal(ui.run('state.settings.courts'),7);
 assert.equal(ui.run('state.started'),false);
 assert.match(ui.node('#dialog').innerHTML,/<option value="md" selected/);
 assert.match(ui.node('#dialog').innerHTML,/<option value="wd"/);
});

test('default scoreboard has two complete doubles tables and seven courts',()=>{
 const ui=boot({hash:'#board'}),html=ui.html();
 assert.equal((html.match(/<section class="board-division"/g)||[]).length,2);
 assert.equal((html.match(/<td class="standings-names">/g)||[]).length,24);
 assert.equal((html.match(/<article class="board-court /g)||[]).length,7);
 assert.match(html,/data-category="md"/);assert.match(html,/data-category="wd"/);
 assert.ok(!html.includes('data-category="xd"'));assert.ok(!html.includes('data-category="ws"'));
});
