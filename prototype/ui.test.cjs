// Offline view checks: execute the real renderer without a browser or network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('./core.js');
const S=require('./simulation.js');
const legacyDay=require('./fixtures/legacy-day.cjs');
const script=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');

function boot({hash='',search='',savedState,legacyState,simulationControl}={}){
 const nodes=new Map(),listeners=new Map(),intervals=[],downloads=[];
 let focused='';
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set(/^#score-\d-\d$/.test(id)?['score-input']:[]);
   nodes.set(id,{id:id.replace(/^#/,''),innerHTML:'',scrollTop:0,value:'',open:false,disabled:false,textContent:'',
    classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},contains:name=>classes.has(name),
     toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}},
    focus(){focused=id;},select(){this.selected=true;},closest(){return null;},setAttribute(){},
    showModal(){
     this.open=true;
     for(const match of this.innerHTML.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g)){
      node('#'+match[1]).value=match[2];node('#'+match[1]).disabled=false;
     }
    },close(){this.open=false;}});
  }
  return nodes.get(id);
 };
 const storage=new Map(savedState?[['swisscourt-ui-md-wd-7-v1-live',JSON.stringify(savedState)]]:[]);
 if(legacyState)storage.set('swisscourt-ui-v1-live',JSON.stringify(legacyState));
 if(simulationControl)storage.set('swisscourt-yug-arena-simulation-v1',JSON.stringify(simulationControl));
 const context=vm.createContext({
  SwissCourtCore:C,SwissCourtSimulation:S,structuredClone,URLSearchParams,Blob,console,Date,
  URL:class extends URL{static createObjectURL(blob){downloads.push(blob);return 'blob:test';}static revokeObjectURL(){}},
  location:{hash,search,href:'http://localhost/#'+hash},history:{replaceState(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),createElement(){return {click(){}};},addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);}},
  window:{addEventListener(){},scrollTo(){}},setInterval(fn,ms){intervals.push({fn,ms});},setTimeout(){},clearTimeout(){}
 });
 vm.runInContext(script,context);
 return {run:code=>vm.runInContext(code,context),html:()=>node('#app').innerHTML,node,storage,intervals,downloads,
  focused:()=>focused,
  input(id,value){const target=node(id);target.value=String(value);for(const fn of listeners.get('input')||[])fn({target});},
  enter(id){for(const fn of listeners.get('keydown')||[])fn({key:'Enter',target:node(id),preventDefault(){}});},
  click(dataset){const target={dataset};target.closest=()=>target;for(const fn of listeners.get('click')||[])fn({target});}};
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

test('surname initials and noninteractive division separator reach all match views',()=>{
 const ui=boot();assert.match(ui.html(),/ЧЕРНОВА М/);assert.match(ui.html(),/ЧЕРНОВА Ю/);
 ui.run('scoreDialog(state.matches.find(m=>m.status==="playing").id)');
 const score=ui.node('#dialog').innerHTML;
 assert.match(score,/class="division-code tag-md">MD/);
 assert.ok(!score.includes('>VS<'));
 assert.ok(!score.includes('Алексей Соколов'));
 ui.run('assignDialog(C.queue(state)[0].id,7)');
 assert.match(ui.node('#dialog').innerHTML,/class="versus"[^>]*><span class="division-code/);
 ui.run('lookupQuery="Чернова"');const lookup=ui.run('lookupResults()');
 assert.equal((lookup.match(/class="lookup-result"/g)||[]).length,2);
 assert.match(lookup,/Сейчас на корте 4/);
 assert.match(lookup,/ЧЕРНОВА М/);assert.match(lookup,/ЧЕРНОВА Ю/);
 ui.run('view="results";render()');
 assert.ok(!ui.html().includes('Алексей Соколов'));
 assert.match(ui.html(),/class="versus"[^>]*><span class="division-code/);
 ui.run('view="participants";render()');assert.match(ui.html(),/Алексей Соколов/);
});

test('whole court control opens score entry and saving frees the court and updates progress',()=>{
 const ui=boot(),m=JSON.parse(ui.run('JSON.stringify(state.matches.find(m=>m.court===1))'));
 const card=ui.run('courtCard(1)');
 assert.match(card,new RegExp('class="court-open" data-action="score" data-id="'+m.id+'"'));
 assert.ok(!card.includes('court-score'));
 assert.ok(card.indexOf('court-clock')<card.indexOf('division-code'));
 ui.click({action:'score',id:m.id});
 assert.equal(ui.node('#dialog').open,true);
 for(const [index,scores] of [[0,[21,17]],[1,[18,21]],[2,[21,15]]]){
  scores.forEach((value,side)=>ui.node('#score-'+index+'-'+side).value=String(value));
 }
 ui.click({action:'save-score'});
 assert.equal(ui.node('#dialog').open,false);
 assert.match(ui.run('courtCard(1)'),/data-action="choose-match"/);
 const progress=ui.run('gameProgress('+JSON.stringify(m.a)+')');
 assert.equal((progress.match(/data-action="match-details"/g)||[]).length,2);
 assert.match(progress,/Победа 2:1/);
 ui.click({action:'match-details',id:m.id,entry:m.b});
 assert.match(ui.node('#dialog').innerHTML,/поражение 1:2/);
 assert.match(ui.node('#dialog').innerHTML,/21:17 · 18:21 · 21:15/);
});

test('scoreboard prioritizes progress, marks active pairs and shared leaders, shows four preparing matches',()=>{
 const state=C.seed(),ui=boot({hash:'#board',savedState:state}),html=ui.html();
 assert.ok(!html.includes('title="Игры">И'));
 assert.ok(!html.includes('title="Победы">В'));
 assert.ok(!html.includes('title="Поражения">П'));
 assert.equal((html.match(/class="game-result (win|loss)/g)||[]).length,24);
 assert.equal((html.match(/class="game-result playing"/g)||[]).length,12);
 assert.equal((html.match(/class="playing-marker"/g)||[]).length,0);
 const leaders=state.categories.flatMap(c=>C.standings(state,c.id)).filter(r=>r.place===1&&r.points>0).length;
 assert.equal((html.match(/class="leader-mark"/g)||[]).length,leaders);
 const next=html.split('<section class="board-next">')[1].split('<section class="board-current">')[0];
 assert.equal((next.match(/class="board-next-match"/g)||[]).length,4);
 assert.equal((next.match(/class="team-names"/g)||[]).length,8);
 assert.ok(!next.includes('board-next-meta'));
 for(const type of ['win deciding','loss deciding','win"','loss"'])assert.ok(html.includes('game-result '+type),type);
 const m=state.matches.find(m=>m.status==='done');
 ui.click({action:'match-details',id:m.id,entry:m.a});
 assert.match(ui.node('#dialog').innerHTML,/Результат встречи/);
 assert.ok(!ui.node('#dialog').innerHTML.includes('data-action="score"'));
});

test('score entry autofills either opponent for 0–18, and retracts only its own suggestion for 19, 20 or blank',()=>{
 const ui=boot();ui.run('scoreDialog(state.matches.find(m=>m.status==="playing").id)');
 ui.input('#score-0-0','1');assert.equal(ui.node('#score-0-1').value,'21');
 ui.input('#score-0-0','18');assert.equal(ui.node('#score-0-1').value,'21');
 ui.input('#score-0-0','19');assert.equal(ui.node('#score-0-1').value,'');
 ui.input('#score-0-0','2');assert.equal(ui.node('#score-0-1').value,'21');
 ui.input('#score-0-0','20');assert.equal(ui.node('#score-0-1').value,'');
 ui.input('#score-0-1','22');assert.equal(ui.node('#score-0-0').value,'20');
 ui.input('#score-0-0','18');assert.equal(ui.node('#score-0-1').value,'22','manual score must survive');
 ui.input('#score-0-0','');ui.input('#score-0-1','0');
 assert.equal(ui.node('#score-0-0').value,'21');
 ui.input('#score-0-1','');assert.equal(ui.node('#score-0-0').value,'');
 for(const value of ['19','20','21','30','-1','1.5','']){
  ui.input('#score-0-0',value);assert.equal(ui.node('#score-0-1').value,'',value);
 }
});

test('two losing scores and Enter identify the other winner and skip automatic fields',()=>{
 const ui=boot();ui.run('scoreDialog(state.matches.find(m=>m.status==="playing").id)');
 ui.input('#score-0-0','12');
 assert.equal(ui.node('#score-0-1').classList.contains('game-won'),true);
 assert.equal(ui.node('#score-wins-1').textContent,'Партий: 1');
 assert.equal(ui.node('#score-team-1').classList.contains('match-winner'),false);
 ui.enter('#score-0-0');assert.equal(ui.focused(),'#score-1-0');
 ui.input('#score-1-0','17');
 assert.equal(ui.node('#score-team-1').classList.contains('match-winner'),true);
 assert.equal(ui.node('#score-team-0').classList.contains('match-winner'),false);
 assert.match(ui.node('#score-wins-1').textContent,/Победа/);
 assert.equal(ui.node('#score-2-0').disabled,true);
 assert.equal(ui.node('#score-2-1').disabled,true);
 ui.enter('#score-1-0');assert.equal(ui.focused(),'[data-action="save-score"]');
 ui.input('#score-1-0','20');
 assert.equal(ui.node('#score-1-1').value,'');
 assert.equal(ui.node('#score-team-1').classList.contains('match-winner'),false);
 assert.equal(ui.node('#score-1-1').classList.contains('game-won'),false);
 assert.equal(ui.node('#score-2-0').disabled,false);
});

test('split sets require a valid decider and highlight the final winner without changing manual deuce scores',()=>{
 const ui=boot();ui.run('scoreDialog(state.matches.find(m=>m.status==="playing").id)');
 ui.input('#score-0-1','14');ui.input('#score-1-0','15');
 assert.equal(ui.node('#score-wins-0').textContent,'Партий: 1');
 assert.equal(ui.node('#score-wins-1').textContent,'Партий: 1');
 assert.ok(!ui.node('#score-team-0').classList.contains('match-winner'));
 assert.ok(!ui.node('#score-team-1').classList.contains('match-winner'));
 assert.equal(ui.node('#score-2-0').disabled,false);
 ui.input('#score-2-0','20');ui.input('#score-2-1','21');
 assert.ok(!ui.node('#score-team-1').classList.contains('match-winner'),'21:20 is incomplete');
 ui.input('#score-2-1','22');
 assert.equal(ui.node('#score-2-0').value,'20');
 assert.equal(ui.node('#score-team-1').classList.contains('match-winner'),true);
 assert.match(ui.node('#score-summary').textContent,/1:2/);
 ui.click({action:'save-score'});
 const id=ui.run('scoreMatchId');ui.click({action:'score',id});
 assert.equal(ui.node('#score-2-0').value,'20');
 assert.equal(ui.node('#score-team-1').classList.contains('match-winner'),true);
 ui.input('#score-2-0','18');
 assert.equal(ui.node('#score-2-1').value,'22','correction must not overwrite stored manual scores');
 assert.equal(ui.node('#score-team-1').classList.contains('match-winner'),false);
});

test('four-match preparation limit applies to older saved demos and manual pins',()=>{
 const state=C.seed();state.settings.prepareCount=2;
 const queued=C.queue(state),ui=boot({savedState:state});
 queued.slice(-4).forEach(m=>ui.click({action:'pin',id:m.id}));
 assert.equal(ui.run('preparingMatches().length'),4);
 assert.deepEqual(JSON.parse(ui.run('JSON.stringify(preparingMatches().map(m=>m.id))')),queued.slice(-4).map(m=>m.id));
 ui.click({action:'pin',id:queued[0].id});
 assert.match(ui.node('#toast').textContent,/4 встречи/);
 assert.equal(ui.run('state.matches.filter(m=>m.pinned).length'),4);
});

test('blocked queue colors the occupied team and keeps court and rest hints beside names',()=>{
 const ui=boot({savedState:legacyDay()});
 const row=ui.run('queueRow(C.queueItems(state).find(m=>C.matchAvailability(state,m).blockers.some(b=>b.type==="busy")),0)');
 assert.match(row,/match-side with-activity is-busy/);
 assert.match(row,/activity-busy/);
 assert.match(row,/aria-label="Играют на корте 3/);
 assert.ok(!row.includes('queue-division'));
 assert.ok(!row.includes('последняя игра до'));
});

test('live timer updates its color without rerendering or closing the score dialog',()=>{
 const ui=boot();
 ui.run('var timerClasses=new Set(["time-long"]);var timer={dataset:{started:Date.now()-30*60000},parentElement:{classList:{toggle(name,enabled){if(enabled)timerClasses.add(name);else timerClasses.delete(name);}}}};document.querySelectorAll=()=>[timer];');
 ui.node('#dialog').open=true;
 ui.intervals.find(timer=>timer.ms===1000).fn();
 assert.equal(ui.run('timer.textContent'),30);
 assert.equal(ui.run('timerClasses.has("time-delayed")'),true);
 assert.equal(ui.run('timerClasses.has("time-long")'),false);
 assert.equal(ui.node('#dialog').open,true);
});

test('progress tooltip gives the selected side’s opponent and score and stays inside the viewport',()=>{
 const ui=boot();
 Object.assign(ui.node('#progress-tooltip'),{style:{},offsetWidth:300,offsetHeight:90});
 ui.run('window.innerWidth=1000;window.innerHeight=700;var m=state.matches.find(m=>m.status==="done"&&m.scores.length===3);var tooltipTarget={dataset:{entry:m.b,id:m.id},getBoundingClientRect:()=>({left:950,top:50,bottom:81}),setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}};showProgressTooltip(tooltipTarget);');
 const tooltip=ui.node('#progress-tooltip');
 assert.equal(tooltip.hidden,false);
 assert.match(tooltip.innerHTML,/Поражение 1:2/);
 assert.match(tooltip.innerHTML,/Соперники: ИВАНОВ \/ ФЁДОРОВ/);
 assert.match(tooltip.innerHTML,/17:21 · 21:18 · 16:21/);
 assert.equal(tooltip.style.left,'692px');
 assert.equal(tooltip.style.top,'89px');
 assert.equal(ui.run('tooltipTarget["aria-describedby"]'),'progress-tooltip');
 ui.run('hideProgressTooltip()');
 assert.equal(tooltip.hidden,true);
 assert.equal(ui.run('tooltipTarget["aria-describedby"]'),undefined);
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

test('simulation board has 17 pairs, a shared clock and pause/restart without touching live data',()=>{
 const live=C.seed(),ui=boot({hash:'#board',search:'?scenario=simulation',savedState:live});
 assert.equal((ui.html().match(/<td class="standings-names">/g)||[]).length,17);
 assert.match(ui.html(),/Юг-Арена/);
 assert.match(ui.html(),/СИМУЛЯЦИЯ ×10/);
 assert.match(ui.html(),/data-action="simulation-pause"/);
 assert.equal(ui.run('state.matches.filter(m=>m.status==="playing").length'),7);
 ui.click({action:'simulation-pause'});
 assert.equal(ui.run('simulationControl.paused'),true);
 const held=ui.run('simulationElapsed()');
 ui.run('refreshSimulation(true)');
 assert.equal(ui.run('simulationElapsed()'),held);
 ui.run('simulationControl={version:1,anchorAt:Date.now(),elapsedMs:150*60000,paused:true};refreshSimulation(true)');
 assert.equal(ui.run('state.matches.filter(m=>m.status==="done").length'),32);
 assert.equal((ui.html().match(/data-action="bye-details"/g)||[]).length,4);
 assert.match(ui.html(),/Все встречи завершены/);
 const bye=JSON.parse(ui.run('JSON.stringify(state.byes[0])'));
 ui.click({action:'bye-details',id:bye.id});
 assert.match(ui.node('#dialog').innerHTML,/встреча и победа не засчитываются/);
 ui.click({action:'simulation-restart'});
 assert.equal(ui.run('state.matches.filter(m=>m.status==="done").length'),0);
 assert.equal(ui.run('simulationControl.paused'),false);
 assert.deepEqual(JSON.parse(ui.storage.get('swisscourt-ui-md-wd-7-v1-live')),live);
});

test('reloading a paused simulation restores its position and uses simulated rest times',()=>{
 const control={version:1,anchorAt:Date.now(),elapsedMs:60*60000,paused:true};
 const ui=boot({hash:'#board',search:'?scenario=simulation',simulationControl:control});
 assert.equal(ui.run('simulationElapsed()'),60*60000);
 assert.equal(ui.run('time(gameNow())'),'11:00');
 assert.match(ui.html(),/60 \/ 150 мин/);
 const rest=ui.run('C.entryActivity(state,state.entries.find(e=>!C.entryActivity(state,e.id,gameNow()).playing).id,gameNow()).restMinutes');
 assert.ok(rest===null||rest<61);
});

test('active court occupies a progress tile until finishing or returning the match',()=>{
 const ui=boot(),m=JSON.parse(ui.run('JSON.stringify(state.matches.find(m=>m.court===1))'));
 for(const id of [m.a,m.b]){
  const progress=ui.run('gameProgress('+JSON.stringify(id)+')');
  assert.match(progress,/Сыграно встреч: 1 · Сейчас на корте 1/);
  assert.match(progress,/<span class="game-result playing" role="img" data-court="1"/);
  assert.ok(progress.indexOf('data-action="match-details"')<progress.indexOf('game-result playing'));
 }
 ui.run('C.returnToQueue(state,'+JSON.stringify(m.id)+')');
 assert.ok(!ui.run('gameProgress('+JSON.stringify(m.a)+')').includes('game-result playing'));
 ui.run('C.assign(state,'+JSON.stringify(m.id)+',1);C.finish(state,'+JSON.stringify(m.id)+',[[21,15],[18,21],[21,19]])');
 for(const id of [m.a,m.b]){
  const progress=ui.run('gameProgress('+JSON.stringify(id)+')');
  assert.match(progress,/Сыграно встреч: 2/);
  assert.ok(!progress.includes('game-result playing'));
  assert.match(progress,/<sup aria-hidden="true">3<\/sup>/);
 }
});

test('both tables display coefficients, crown only the ranked winner and preserve full ties',()=>{
 const plan=S.createPlan(),state=S.snapshot(plan,150*S.minute);
 const ui=boot({hash:'#board',savedState:state}),html=ui.html();
 assert.equal((html.match(/>Соперники<\/th>/g)||[]).length,2);
 assert.equal((html.match(/>Побежденные<\/th>/g)||[]).length,2);
 const wd=ui.run('standingsTable("wd",true)'),women=C.standings(state,'wd');
 assert.equal(women.filter(r=>r.points===3).length,3);
 assert.equal((wd.match(/class="leader-mark"/g)||[]).length,1);
 assert.match(wd,/Победитель разряда · 1 место/);
 let previous=-1;
 for(const row of women){
  const at=wd.indexOf(C.playerLabel(state,row.entry.players[0]),previous+1);
  assert.ok(at>previous);previous=at;
 }
 const organizer=ui.run('standingsTable("wd")');
 assert.match(organizer,/>Соперники<\/th>/);assert.match(organizer,/>Побежденные<\/th>/);
 assert.ok(!organizer.includes('Бухг.</th>'));
 ui.run('state.matches=[];state.byes=[];state.simulation=null');
 const tied=ui.run('standingsTable("wd",true)');
 assert.ok(!tied.includes('leader-mark'));assert.match(tied,/Равенство всех показателей/);
 assert.equal((tied.match(/>1=<\/span>/g)||[]).length,9);
 ui.run('state='+JSON.stringify(state)+';state.categories=[{id:"md",code:"MD",rounds:1}];state.entries=state.entries.filter(e=>e.category==="md");state.matches=state.matches.filter(m=>m.category==="md"&&m.round===1);state.matches.forEach(m=>m.scores=[[21,15],[21,15]]);state.byes=[];state.simulation=null');
 const completeTie=ui.run('standingsTable("md",true)');
 assert.equal((completeTie.match(/class="leader-mark"/g)||[]).length,4);
 assert.equal((completeTie.match(/<small>1=<\/small>/g)||[]).length,4);
 assert.ok(!completeTie.includes('Победитель разряда'));
});

test('CSV exports the same points, coefficients and positions as the tables',async()=>{
 const state=S.snapshot(S.createPlan(),150*S.minute),ui=boot({savedState:state});
 ui.run('selectedCategory="wd";exportCsv()');
 const csv=await ui.downloads[0].text();
 assert.match(csv,/"Место";"Очки";"Соперники";"Побежденные"/);
 const rows=C.standings(state,'wd');
 assert.equal(csv.split('\r\n').length,rows.length+1);
 for(const row of rows)assert.ok(csv.includes('"'+row.entry.players[1].name+'";"'+row.place+'";"'+row.points+'";"'+row.buchholz+'";"'+row.berger+'";'));
});
