/* SwissCourt 1.0.0: organizer and public display. */
'use strict';
const C=SwissCourtCore;
const T=SwissCourtTournament,D=SwissCourtStorage;
const S=typeof SwissCourtSimulation==="undefined"?null:SwissCourtSimulation;
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 court:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M3 12h18M6 5v14M18 5v14"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/>',
 table:'<path d="M4 20h16M6 16v-5M12 16V4M18 16V8"/>',
 history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
 monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 pin:'<path d="m8 3 8 0-1 6 3 4v2H6v-2l3-4-1-6ZM12 15v7"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 location:'<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
 refresh:'<path d="M20 4v6h-6M4 20v-6h6M5.5 7a8 8 0 0 1 14 1M4.5 16a8 8 0 0 0 14 1"/>',
 edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15l-1 5Z"/>',
 link:'<path d="m10 14 4-4M9 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(0 -1) scale(.95)"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 play:'<path d="m8 5 11 7-11 7V5Z"/>',
 pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',
 crown:'<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5L3 6ZM5 16h14"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'
};
const icon=(name,cls='')=>'<svg class="'+cls+'" aria-hidden="true" viewBox="0 0 24 24">'+(paths[name]||paths.court)+'</svg>';
const boardMode=location.hash==='#board';
const params=new URLSearchParams(location.search);
const prepareMatchCount=4;
let mode=['simulation','prep','live'].includes(params.get('scenario'))?params.get('scenario'):'real';
let editorReady=false,editorBusy=false,recoveryState=null;
let offlineReady=false,offlineError='';
const simulationStorageKey='swisscourt-yug-arena-simulation-v1';
let simulationPlan=null,simulationControl=null,simulationStamp='';
function initSimulation(){
 if(!simulationPlan)simulationPlan=S.createPlan();
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(simulationStorageKey)||'null');}catch{}
 const valid=saved&&saved.version===1&&Number.isFinite(saved.anchorAt)&&Number.isFinite(saved.elapsedMs)&&typeof saved.paused==='boolean';
 simulationControl=valid?saved:
  {version:1,anchorAt:Date.now(),elapsedMs:0,paused:false};
 if(!valid)try{localStorage.setItem(simulationStorageKey,JSON.stringify(simulationControl));}catch{}
}
function simulationElapsed(){return S.playbackElapsed(simulationControl);}
function gameNow(){return mode==='simulation'?simulationPlan.startsAt+simulationElapsed():Date.now();}
function refreshSimulation(force=false){
 if(mode!=='simulation')return;
 const elapsedMs=simulationElapsed(),stamp=Math.floor(elapsedMs/60000)+':'+simulationControl.paused;
 if(force||stamp!==simulationStamp){
  state=S.snapshot(simulationPlan,elapsedMs);simulationStamp=stamp;render();
 }
}
function controlSimulation(restart=false){
 const next={version:1,anchorAt:Date.now(),elapsedMs:restart?0:simulationElapsed(),paused:restart?false:!simulationControl.paused};
 simulationControl=next;
 try{localStorage.setItem(simulationStorageKey,JSON.stringify(next));}catch{toast('Симуляция работает в этой вкладке, но её положение не удалось сохранить.');}
 refreshSimulation(true);
}
function simulationControls(){
 if(mode!=='simulation')return '';
 const paused=simulationControl.paused,ended=simulationElapsed()>=S.limitMinutes*S.minute;
 return '<button class="icon-btn" data-action="simulation-pause" aria-label="'+(paused?'Продолжить':'Пауза')+' симуляцию" title="'+(paused?'Продолжить':'Пауза')+'" '+(ended?'disabled':'')+'>'+icon(paused?'play':'pause')+'</button><button class="icon-btn" data-action="simulation-restart" aria-label="Начать симуляцию заново" title="Начать заново">'+icon('refresh')+'</button>';
}
function simulationStatus(){
 if(mode==='real')return state.closed?'ДЕНЬ ЗАВЕРШЁН':state.started?'ТУРНИР ИДЁТ':'ПОДГОТОВКА';
 if(mode!=='simulation')return 'ДЕМО';
 return 'СИМУЛЯЦИЯ ×10 · '+Math.floor(simulationElapsed()/60000)+' / 150 мин'+(state.simulation.complete?' · Все встречи завершены':simulationControl.paused?' · Пауза':'');
}
let state,storageError='',view=boardMode?'board':(location.hash.slice(1)||'dashboard'),filter='all',selectedCategory='md',query='',scoreMatchId='',assignMatchId='';
// A distinct demo identity opens the requested scenario without deleting the previous demo.
const storageKey=()=>mode==='real'?D.key:'swisscourt-ui-md-wd-7-v1-'+mode;
function loadState(){storageError='';if(mode==='real'){const loaded=D.read(localStorage);state=loaded.state;storageError=loaded.error;recoveryState=loaded.recovery||null;return;}if(mode==='simulation'){initSimulation();state=S.snapshot(simulationPlan,simulationElapsed());return;}try{const raw=localStorage.getItem(storageKey());if(raw){const parsed=JSON.parse(raw);if(parsed.version!==1||!Array.isArray(parsed.matches)||!Array.isArray(parsed.entries)||!parsed.settings||!Array.isArray(parsed.categories)||!Array.isArray(parsed.history))throw Error('Неверный формат');state=parsed;}else state=C.seed(mode);}catch(error){state=C.seed(mode);storageError='Не удалось прочитать сохранённый эскиз. Изменения не сохраняются; исходные данные в хранилище не заменены.';}}
loadState();
if(mode!=='real')C.ensureRoundRobinSchedule(state);
function persist(next){
 if(mode==='real'&&(!editorReady||boardMode)){toast('Редактирование доступно только в одной вкладке организатора.');return false;}
 if(storageError){toast(storageError);return false;}
 try{if(mode==='real')state=D.commit(localStorage,next,state);else{localStorage.setItem(storageKey(),JSON.stringify(next));state=next;}return true;}
 catch(error){toast('Изменение не сохранено. '+error.message);return false;}
}
function mutate(fn,message){if(boardMode){toast('Табло доступно только для просмотра.');return false;}if(mode==='real'&&state.closed){toast('День завершён. Откройте его для исправления в настройках.');return false;}if(mode==='simulation'){toast('В симуляции вызов и результаты обновляются автоматически.');return false;}const next=structuredClone(state);try{fn(next);}catch(error){toast(error.message);return false;}if(!persist(next))return false;render();if(message)toast(message);return true;}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4600);}
const entry=id=>state.entries.find(e=>e.id===id);
const cat=id=>state.categories.find(c=>c.id===id);
const surnames=id=>C.entryLabel(state,id);
const fullNames=id=>entry(id)?.players.map(p=>esc(p.name)).join('<br>')||'—';
const pairNames=id=>entry(id)?.players.map(p=>'<span>'+esc(C.playerLabel(state,p))+'</span>').join('')||'—';
const badge=id=>'<span class="division-tag tag-'+esc(cat(id).code.toLowerCase())+'" title="'+esc(cat(id).name)+'">'+esc(cat(id).code)+'</span>';
const versus=match=>'<span class="versus" aria-label="'+esc(cat(match.category).name)+' · против"><span class="division-code tag-'+esc(cat(match.category).code.toLowerCase())+'">'+esc(cat(match.category).code)+'</span><small>Тур '+match.round+'</small></span>';
function matchup(match,extra='',withActivity=false){
 const side=id=>{
  const busy=withActivity&&C.entryActivity(state,id,gameNow()).playing;
  return '<div class="match-side '+(withActivity?'with-activity ':'')+(busy?'is-busy':'')+'"><div class="team-names">'+pairNames(id)+'</div>'+(withActivity?activityLine(id):'')+'</div>';
 };
 return '<div class="matchup '+extra+'">'+side(match.a)+versus(match)+side(match.b)+'</div>';
}
const time=value=>new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',...(mode==='simulation'?{timeZone:'Europe/Moscow'}:{})});
const dateLabel=()=>new Date(state.settings.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
const freeCourts=()=>Array.from({length:state.settings.courts},(_,i)=>i+1).filter(c=>!state.matches.some(m=>m.status==='playing'&&m.court===c));
const doneMatches=()=>state.matches.filter(m=>m.status==='done');
const currentRound=id=>{
 const matches=state.matches.filter(m=>m.category===id);
 const pending=matches.filter(m=>m.status!=='done');
 return pending.length?Math.min(...pending.map(m=>m.round)):Math.max(1,...matches.map(m=>m.round));
};
function categoryProgress(id){
 const category=cat(id),n=state.entries.filter(e=>e.category===id).length;
 const total=n<7?n*(n-1)/2:Math.floor(n/2)*category.rounds;
 const done=state.matches.filter(m=>m.category===id&&m.status==='done').length;
 return {total,done,left:Math.max(0,total-done),round:currentRound(id),rounds:n<7?n-1+n%2:category.rounds};
}
const totalMatches=()=>state.categories.reduce((sum,c)=>sum+categoryProgress(c.id).total,0);
const scoreText=m=>m.scores.map(s=>s.join(':')).join(' · ');
const elapsed=value=>Math.max(0,Math.floor((gameNow()-value)/60000));
function blockersText(match){
 return C.matchAvailability(state,match).blockers.map(blocker=>{
  if(blocker.type==='round')return 'Тур '+blocker.round+' не завершён · ещё '+blocker.remaining+' встреч';
  const players=state.entries.flatMap(e=>e.players).filter(p=>blocker.players.includes(C.normalizeName(p.name)));
  return [...new Set(players.map(p=>C.playerLabel(state,p)))].join(' / ')+' · играет на корте '+blocker.court;
 });
}
function activityLine(id){
 const activity=C.entryActivity(state,id,gameNow());
 let status,label,value,glyph='clock';
 if(activity.playing){
  status='busy';glyph='court';value=activity.playing.court;
  label='Играют на корте '+value+' · '+elapsed(activity.playing.startedAt)+' мин';
 }else if(activity.restMinutes===null){
  status='unplayed';value='—';label='Ещё не играли';
 }else{
  value=activity.restMinutes;status=C.restTiming(value);
  const descriptions={critical:'Очень мало отдыха',short:'Меньше рекомендованного отдыха',normal:'Нормальный отдых',long:'Долгое ожидание',overdue:'Слишком долгое ожидание'};
  label=descriptions[status]+' · '+value+' мин · последняя игра завершилась в '+time(activity.lastEndedAt);
 }
 return '<span class="activity activity-'+status+'" data-entry-activity="'+esc(id)+'" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+icon(glyph)+'<b>'+value+'</b></span>';
}
function pendingByeMarker(id){
 const bye=state.simulation?.pendingByes.find(bye=>bye.entryId===id);
 return bye?'<span class="bye-marker" title="Тур '+bye.round+': без соперника · +1 очко после завершения тура" aria-label="Пропуск тура '+bye.round+'">'+icon('pause')+'</span>':'';
}
function progressLabel(game){
 if(game.bye)return 'Тур '+game.round+' · Пропуск без соперника · +1 очко, без сыгранной встречи';
 return (game.won?'Победа':'Поражение')+' '+game.setsFor+':'+game.setsAgainst+' · Тур '+game.round+' · '+surnames(game.opponentId)+' · '+game.scores.map(score=>score.join(':')).join(', ');
}
function gameProgress(id){
 const games=C.entryProgress(state,id),played=games.filter(game=>!game.bye).length;
 const active=C.entryActivity(state,id,gameNow()).playing;
 if(active)games.push({playing:true,round:active.round,court:active.court});
 games.sort((a,b)=>a.round-b.round);
 return '<div class="game-progress" aria-label="Сыграно встреч: '+played+(active?' · Сейчас на корте '+active.court:'')+'">'+games.map(game=>{
  if(game.playing){const label='Играют на корте '+game.court+' · Тур '+game.round;return '<span class="game-result playing" role="img" data-court="'+game.court+'" title="'+label+'" aria-label="'+label+'"><b aria-hidden="true">'+game.court+'</b></span>';}
  if(game.bye)return '<button class="game-result bye" data-action="bye-details" data-id="'+game.matchId+'" data-entry="'+esc(id)+'" title="'+esc(progressLabel(game))+'" aria-label="'+esc(progressLabel(game))+'">–</button>';
  return '<button class="game-result '+(game.won?'win':'loss')+(game.deciding?' deciding':'')+'" data-action="match-details" data-id="'+game.matchId+'" data-entry="'+esc(id)+'" aria-label="'+esc(progressLabel(game))+'">'+icon(game.won?'check':'close')+(game.deciding?'<sup aria-hidden="true">3</sup>':'')+'</button>';
 }).join('')+(!games.length?'<span class="progress-empty" title="Ещё нет завершённых встреч">—</span>':'')+'</div>';
}
function progressLegend(){
 return '<div class="progress-legend" aria-label="Обозначения результатов"><span><i class="game-result win">'+icon('check')+'</i>победа</span><span><i class="game-result loss">'+icon('close')+'</i>поражение</span><span><i class="deciding-key">3</i>три партии</span><span><i class="game-result playing">7</i>играют · номер корта</span></div>';
}
function preparingMatches(){
 const available=C.queue(state,gameNow());
 return [...available.filter(m=>m.pinned),...available.filter(m=>!m.pinned)].slice(0,prepareMatchCount);
}
function restLabel(m){return '<div class="match-rest">'+activityLine(m.a)+activityLine(m.b)+'</div>';}
function categoryFilters(active,action,all=true){
 return (all?'<button class="filter '+(active==='all'?'active':'')+'" data-action="'+action+'" data-id="all" aria-pressed="'+(active==='all')+'">Все</button>':'')+state.categories.map(c=>'<button class="filter '+(active===c.id?'active':'')+'" data-action="'+action+'" data-id="'+c.id+'" aria-pressed="'+(active===c.id)+'" title="'+esc(c.name)+'">'+badge(c.id)+'</button>').join('');
}
let lookupQuery='';
let queuePositions=new Map();
function lookupResults(){
 const needle=C.normalizeName(lookupQuery);
 if(!needle)return '';
 const matches=state.entries.filter(e=>e.players.some(p=>C.normalizeName(p.name).includes(needle)));
 const ordered=C.queueItems(state,gameNow());
 return '<div class="lookup-heading"><strong>Когда я играю?</strong><button class="icon-btn" data-action="close-lookup" aria-label="Закрыть поиск">'+icon('close')+'</button></div>'+(matches.length?matches.map(e=>{
  const next=C.nextForEntry(state,e.id,gameNow(),ordered);let status='',detail='';
  if(next.kind==='playing'){status='Сейчас на корте '+next.match.court;detail='Игра идёт '+elapsed(next.match.startedAt)+' мин · Тур '+next.match.round;}
  if(next.kind==='queued'){status='№ '+next.position+' в рекомендуемой очереди';detail=next.position===1?'Первая доступная встреча. Вызов объявляет организатор.':(next.position-1)+' встреч впереди. Порядок может измениться.';}
  if(next.kind==='blocked'){status='Ожидает вызова · Тур '+next.match.round;detail=blockersText(next.match).join('. ');}
  if(next.kind==='waiting'){const p=categoryProgress(e.category);status=p.done===p.total?'Все встречи завершены':'Следующий тур ещё не сформирован';detail='Сыграно встреч: '+T.standings(state,e.category).find(r=>r.entry.id===e.id).played;}
  if(next.kind==='preparation'){status='Турнир ещё не начался';detail='Состав и первый тур находятся в подготовке.';}
  return '<article class="lookup-result"><div class="spread">'+badge(e.category)+'<strong class="lookup-name">'+esc(surnames(e.id))+'</strong></div><h3>'+status+'</h3><p>'+esc(detail)+'</p>'+(next.match?matchup(next.match,'lookup-match'):'')+'<div class="lookup-rest">'+activityLine(e.id)+'</div></article>';
 }).join(''):'<div class="empty">Участник не найден. Попробуйте другую фамилию.</div>');
}

function nav(){
 const items=[['dashboard','grid',state.started?'Очередь':'Подготовка'],['standings','table','Таблицы'],['results','history','Результаты'],['participants','people','Участники'],['settings','settings','Настройки']];
 return '<div class="workspace-nav"><nav class="nav" aria-label="Основная навигация">'+items.map(([id,ico,label])=>'<a href="#'+id+'" class="'+(view===id?'active':'')+'" '+(view===id?'aria-current="page"':'')+'>'+icon(ico)+'<span>'+label+'</span>'+(id==='dashboard'&&state.started?'<span class="count">'+C.queueItems(state,gameNow()).length+'</span>':'')+'</a>').join('')+'</nav><div class="player-lookup"><label class="search">'+icon('search')+'<input id="player-lookup" class="form-control" type="search" autocomplete="off" placeholder="Когда я играю? Фамилия…" aria-label="Когда я играю — поиск по фамилии" aria-expanded="'+Boolean(lookupQuery)+'" aria-controls="lookup-results" value="'+esc(lookupQuery)+'"></label><div id="lookup-results" class="lookup-results" '+(!lookupQuery?'hidden':'')+' aria-live="polite">'+lookupResults()+'</div></div></div>';
}
function topbar(){
 return '<header class="topbar"><a class="brand" href="#dashboard"><span class="brand-mark">'+icon('court')+'</span><strong>SwissCourt</strong><span class="demo-label">v1.0.0</span></a><div class="day-context"><strong>'+esc(state.settings.title)+'</strong><span>'+dateLabel()+' · '+esc(state.settings.venue)+'</span></div><div class="top-actions"><span class="offline-status" title="'+(offlineError||'Заранее откройте приложение с интернетом на каждом устройстве')+'">'+(offlineReady?'● Офлайн готов':'○ Офлайн не готов')+'</span><span class="save-status" title="'+(storageError?'Хранилище недоступно':'Данные сохраняются в этом браузере')+'">'+icon(storageError?'info':'shield')+'</span><button class="btn dark" data-action="board">'+icon('monitor')+'<span>Табло</span></button><button class="icon-btn" data-action="about" aria-label="О приложении">'+icon('info')+'</button></div></header>';
}

function heading(title,subtitle,actions=''){
 return '<div class="page-heading"><div><h1>'+title+'</h1><p>'+subtitle+'</p></div>'+actions+'</div>';
}
function footer(){return '';}
function summary(){return '<div class="overall-progress"><b>'+doneMatches().length+'</b> сыграно <span>·</span><b>'+Math.max(0,totalMatches()-doneMatches().length)+'</b> осталось <span>·</span><b>'+state.matches.filter(m=>m.status==='playing').length+'/'+state.settings.courts+'</b> кортов занято</div>';}

function courtCard(number){
 const m=state.matches.find(m=>m.status==='playing'&&m.court===number);
 const minutes=m?elapsed(m.startedAt):0;
 const label=m?'Корт '+number+' · '+surnames(m.a)+' против '+surnames(m.b)+' · Внести счёт':'Корт '+number+' свободен · Назначить встречу';
 const header='<div class="court-heading"><div class="court-number"><span>КОРТ</span><strong>'+number+'</strong></div>'+(m?'<div class="court-clock time-'+C.courtTiming(minutes)+'"><strong data-started="'+m.startedAt+'">'+minutes+'</strong><span>мин</span></div>':'<span class="court-free-label"><i class="dot"></i>СВОБОДЕН</span>')+'</div>';
 return '<article class="court '+(m?'occupied':'free')+'" data-court="'+number+'">'+header+(m?'<div class="court-match">'+matchup(m)+'</div>':'<div class="free-court-body">'+icon('plus')+'<span>Назначить встречу</span></div>')+'<button class="court-open" data-action="'+(m?'score':'choose-match')+'" '+(m?'data-id="'+m.id+'" ':'')+'data-court="'+number+'" aria-label="'+esc(label)+'"></button></article>';
}
function courtsDock(){
 return '<section class="courts-dock" aria-label="Постоянная панель кортов"><div class="courts-grid '+(state.settings.courts>4?'dense-courts':'')+'" style="--court-count:'+Math.min(4,state.settings.courts)+';--total-courts:'+state.settings.courts+'">'+Array.from({length:state.settings.courts},(_,i)=>courtCard(i+1)).join('')+'</div></section>';
}
function queueRow(m,index,compact=false){
 const availability=C.matchAvailability(state,m),canCall=availability.available&&freeCourts().length>0;
 const position=queuePositions.get(m.id)||0,blocked=blockersText(m);
 return '<article class="queue-row '+(!availability.available?'blocked':'')+'" data-match="'+m.id+'"><div class="queue-order">'+(availability.available?String(position).padStart(2,'0'):icon('clock'))+'</div><div class="queue-match">'+matchup(m,'queue-matchup',true)+(m.pinned&&preparingMatches().some(next=>next.id===m.id)?'<span class="prepare-label">'+icon('pin')+'Приготовиться</span>':'')+(!availability.available?'<div class="block-reasons">'+blocked.map(reason=>'<span>'+esc(reason)+'</span>').join('')+'</div>':'')+'</div><div class="queue-actions">'+(!compact?'<button class="icon-btn '+(m.pinned?'selected':'')+'" data-action="pin" data-id="'+m.id+'" aria-label="'+(m.pinned?'Убрать отметку':'Приготовиться')+': '+esc(surnames(m.a))+'" aria-pressed="'+m.pinned+'" '+(!availability.available?'disabled':'')+' title="Приготовиться">'+icon('pin')+'</button>':'')+'<button class="btn '+(canCall?'primary':'')+'" data-action="assign" data-id="'+m.id+'" '+(!canCall?'disabled':'')+' title="'+esc(!availability.available?blocked.join('. '):!freeCourts().length?'Все корты заняты':'Назначить свободный корт')+'">'+(availability.available?'Вызвать':'Ожидает')+'</button></div></article>';
}
function divisionCard(c){
 const p=categoryProgress(c.id);
 return '<div class="division-progress">'+badge(c.id)+'<div class="progress-copy"><span><b>'+p.done+'</b> сыграно · <b>'+p.left+'</b> осталось</span><div class="progress" role="progressbar" aria-label="Прогресс '+c.code+'" aria-valuenow="'+p.done+'" aria-valuemin="0" aria-valuemax="'+p.total+'"><span style="width:'+(p.total?p.done/p.total*100:0)+'%"></span></div></div><small>Тур '+p.round+'/'+p.rounds+'</small></div>';
}
function dashboard(){
 if(!state.started)return preparation();
 const all=C.queueItems(state,gameNow()),list=all.filter(m=>filter==='all'||m.category===filter);
 const ready=list.filter(m=>C.matchAvailability(state,m).available),waiting=list.filter(m=>!C.matchAvailability(state,m).available);
 return (mode==='real'?roundControls():'')+'<section class="queue-panel" id="queue"><div class="queue-toolbar"><div class="row"><h1>Очередь вызова</h1><span class="count">'+all.length+'</span></div><div class="filter-row">'+categoryFilters(filter,'filter')+'</div><span class="queue-help">Отдых &lt; 15 мин — предупреждение, а не запрет</span></div><div class="queue-group-title"><strong>Можно вызвать <span>'+ready.length+'</span></strong><span>Отдых рядом с парой · подробности при наведении</span></div>'+ready.map((m,i)=>queueRow(m,i)).join('')+(!ready.length?'<div class="empty">Сейчас нет доступных встреч. Причины ожидания указаны ниже.</div>':'')+(waiting.length?'<div class="queue-group-title waiting-title"><strong>Ожидают <span>'+waiting.length+'</span></strong><span>Встречи остаются в очереди до освобождения игроков и завершения тура</span></div>'+waiting.map((m,i)=>queueRow(m,i)).join(''):'')+'</section><section class="progress-strip" style="--division-count:'+state.categories.length+'" aria-label="Прогресс турниров">'+state.categories.map(divisionCard).join('')+'</section><div class="queue-bottom">'+summary()+'<span>Порядок рекомендуемый. Вызов — по решению организатора.</span></div>';
}

function preparation(){return heading('Подготовка игрового дня','Проверьте составы и параметры перед первым вызовом.')+'<div class="prep-intro"><div><div class="eyebrow" style="color:#b6cc98;margin-bottom:12px">Всё начинается с хорошей подготовки</div><h2>Ваш следующий игровой день</h2><p>'+dateLabel()+' · '+esc(state.settings.venue)+'<br>'+state.entries.length+' участников и пар · '+state.categories.length+' разряда · '+state.settings.courts+' корта</p></div><button class="btn" data-action="draw">Первый тур'+icon('arrow')+'</button></div><div class="prep-grid"><section class="panel prep-card"><div class="prep-icon">'+icon('settings')+'</div><span class="eyebrow muted">Шаг 01</span><h2>Зал и время</h2><p>Дата, аренда и общие корты для всех разрядов.</p><a class="btn" href="#settings">Настроить день'+icon('arrow')+'</a></section><section class="panel prep-card"><div class="prep-icon">'+icon('people')+'</div><span class="eyebrow muted">Шаг 02</span><h2>Составы и рейтинги</h2><p>Добавьте участников вручную или импортируйте состав.</p><a class="btn" href="#participants">Открыть участников'+icon('arrow')+'</a></section><section class="panel prep-card"><div class="prep-icon">'+icon('court')+'</div><span class="eyebrow muted">Шаг 03</span><h2>Жеребьёвка</h2><p>Посмотрите пары первого тура перед публикацией.</p><button class="btn" data-action="draw">Посмотреть пары'+icon('arrow')+'</button></section></div><div class="notice">'+icon('info')+'Состав фиксируется при публикации первого тура. Результаты сохраняются автоматически на этом устройстве.</div>';}
function participants(){
 const entries=state.entries.filter(e=>(filter==='all'||e.category===filter)&&e.players.some(p=>p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 return heading('Участники','Составы разрядов и индивидуальные рейтинги.',state.started?'<span class="pill">'+icon('shield')+'Составы зафиксированы</span>':'<button class="btn primary" data-action="edit-entry">'+icon('plus')+'Добавить участника</button>')+(state.started?'<div class="notice">'+icon('info')+'Турнир уже идёт, составы доступны для просмотра. Добавление и замена участников доступны до публикации первого тура.</div>':'')+'<div class="tabs">'+categoryFilters(filter,'filter')+'</div><section class="panel"><div class="table-toolbar"><div class="search">'+icon('search')+'<input class="form-control" id="participant-search" type="search" placeholder="Найти по имени или фамилии" aria-label="Поиск участников" value="'+esc(query)+'"></div><span class="muted" style="font-size:11px">Показано: '+entries.length+'</span>'+(!state.started?'<button class="btn small" data-action="import">'+icon('link')+'Из BadminTune</button>':'')+'</div><div class="table-wrap"><table><thead><tr><th>№</th><th>Участник / пара</th><th>Разряд</th><th class="numeric">Рейтинг</th><th>Действия</th></tr></thead><tbody>'+entries.map((e,i)=>'<tr><td class="muted">'+String(i+1).padStart(2,'0')+'</td><td class="team-cell"><strong>'+e.players.map(p=>esc(p.name)).join('<br>')+'</strong><small>'+e.players.map(p=>p.rating===null?'—':p.rating).join(' + ')+(e.players.length===2?' · среднее пары':' · рейтинг СБР')+'</small></td><td>'+badge(e.category)+'</td><td class="numeric"><strong>'+(e.players.some(p=>p.rating===null)?'Нужен рейтинг':C.rating(e).toLocaleString('ru-RU'))+'</strong></td><td><button class="icon-btn" data-action="edit-entry" data-id="'+e.id+'" aria-label="'+(state.started?'Посмотреть':'Редактировать')+' '+esc(surnames(e.id))+'">'+icon(state.started?'info':'edit')+'</button>'+(!state.started?'<button class="icon-btn" data-action="remove-entry" data-id="'+e.id+'" aria-label="Удалить '+esc(surnames(e.id))+'">'+icon('trash')+'</button>':'')+'</td></tr>').join('')+'</tbody></table>'+(entries.length?'':'<div class="empty">Никого не найдено. Попробуйте другую фамилию.</div>')+'</div></section>';
}
const coefficient=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:1});
const circleRankingOrder='Очки → личные встречи → разница партий в личных встречах → разница воланов в личных встречах → разница партий во всех встречах → разница воланов во всех встречах → меньший рейтинг';
const swissRankingOrder='Очки → Соперники → Побежденные → личная встреча двух равных пар → отношение партий → отношение игровых очков';
function standingsTable(id,isBoard=false){
 const rows=T.standings(state,id),swiss=rows.length>=7,p=categoryProgress(id),complete=p.total>0&&p.done===p.total;
 return '<div class="table-wrap"><table class="standings-table"><thead><tr><th class="place-col" title="'+(swiss?swissRankingOrder:circleRankingOrder)+'">№</th><th>Участник / пара</th><th class="progress-col">Прогресс</th><th class="numeric points-col">Очки</th>'+(swiss?'<th class="numeric tiebreak-col" title="Бухгольц — сумма турнирных очков всех соперников; за пропуск — условный соперник">Соперники</th><th class="numeric tiebreak-col" title="Бергер — сумма турнирных очков побеждённых соперников; за пропуск — условный соперник">Побежденные</th>':'')+(!isBoard?'<th class="numeric secondary-stat" title="Игры">И</th><th class="numeric secondary-stat" title="Победы">В</th><th class="numeric secondary-stat" title="Поражения">П</th><th class="numeric secondary-stat">Партии</th>':'')+'</tr></thead><tbody>'+rows.map(r=>{
  const leader=r.place===1&&r.points>0;
  const label=r.tied?'Равенство всех показателей':(complete?'Победитель разряда':'Лидер разряда');
  const details='Очки: '+r.points+(swiss?' · Соперники: '+coefficient(r.buchholz)+' · Побежденные: '+coefficient(r.berger)+(r.headToHead?' · Личная встреча: победа '+surnames(r.headToHead):''):' · Личные встречи: '+r.personalPoints+' · Разница партий: '+r.personalSets+' · Разница воланов: '+r.personalBalls+' · Рейтинг: '+C.rating(r.entry))+' · Партии: '+r.setsFor+':'+r.setsAgainst+' · Игровые очки: '+r.ballFor+':'+r.ballAgainst;
  return '<tr'+(leader?' class="leader-row"':'')+'><td class="place-col" title="'+esc(details)+'">'+(leader?'<span class="leader-mark" title="'+label+' · 1 место" aria-label="'+label+' · 1 место">'+icon('crown')+'<small>1'+(r.tied?'=':'')+'</small></span>':'<span class="place"'+(r.tied?' title="'+label+'"':'')+'>'+r.place+(r.tied?'=':'')+'</span>')+'</td><td class="standings-names"><div class="standing-team"><span class="standing-players">'+entry(r.entry.id).players.map(p=>'<span>'+esc(C.playerLabel(state,p))+'</span>').join('<span class="teammate-divider"> / </span>')+'</span>'+pendingByeMarker(r.entry.id)+'</div></td><td class="progress-col">'+gameProgress(r.entry.id)+'</td><td class="numeric points-col"><strong>'+r.points+'</strong></td>'+(swiss?'<td class="numeric tiebreak-col">'+coefficient(r.buchholz)+'</td><td class="numeric tiebreak-col">'+coefficient(r.berger)+'</td>':'')+(!isBoard?'<td class="numeric secondary-stat">'+r.played+'</td><td class="numeric secondary-stat">'+r.wins+'</td><td class="numeric secondary-stat">'+r.losses+'</td><td class="numeric secondary-stat">'+r.setsFor+':'+r.setsAgainst+'</td>':'')+'</tr>';
 }).join('')+'</tbody></table></div>';
}
function standings(){
 const swiss=state.entries.filter(e=>e.category===selectedCategory).length>=7;
 return heading('Турнирные таблицы','Положение по завершённым встречам. Корты остаются перед глазами.','<button class="btn" data-action="export">'+icon('download')+'CSV · '+esc(cat(selectedCategory).code)+'</button>')+'<div class="tabs">'+categoryFilters(selectedCategory,'category',false)+'</div><section class="panel"><div class="panel-heading">'+badge(selectedCategory)+'<strong>Тур '+currentRound(selectedCategory)+' · '+state.entries.filter(e=>e.category===selectedCategory).length+' участников / пар</strong></div>'+standingsTable(selectedCategory)+progressLegend()+'</section><p class="table-note">'+(swiss?swissRankingOrder+'. Знак = означает полное равенство; для окончательного места нужна дополнительная встреча.':circleRankingOrder+'. Знак = означает полное равенство.')+'</p>';
}
function results(){
 const list=doneMatches().filter(m=>filter==='all'||m.category===filter).sort((a,b)=>b.endedAt-a.endedAt);
 return heading('Результаты','Протоколы и исправления.','<button class="btn" data-action="history">'+icon('history')+'История <span class="count">'+state.history.length+'</span></button>')+'<div class="tabs">'+categoryFilters(filter,'filter')+'</div><section class="panel results-list">'+list.map(m=>'<article class="result-row">'+matchup(m)+'<div class="result-score"><strong>'+C.validateScores(m.scores).wins.join(':')+'</strong><span>'+scoreText(m)+'</span></div><time>'+time(m.endedAt)+'</time><button class="btn" data-action="score" data-id="'+m.id+'">'+icon('edit')+'Исправить</button></article>').join('')+(list.length?'':'<div class="empty">Результатов пока нет.</div>')+'</section>';
}

function settings(){
 const s=state.settings;
 return heading('Настройки игрового дня','Зал, разряды и параметры табло.')+'<div class="settings-grid"><form class="panel form-panel" id="settings-form"><h2>Параметры дня</h2><p>Все разряды используют общие корты.</p><div class="form-grid"><div class="field full"><label for="day-title">Название</label><input id="day-title" class="form-control" name="title" value="'+esc(s.title)+'" maxlength="80" required></div><div class="field full"><label for="venue">Зал</label><input id="venue" class="form-control" name="venue" value="'+esc(s.venue)+'" maxlength="100" required></div><div class="field"><label for="day-date">Дата</label><input id="day-date" class="form-control" name="date" type="date" value="'+s.date+'" required></div><div class="field"><label for="level">Дивизион</label><input id="level" class="form-control" name="level" value="'+esc(s.level)+'" maxlength="60" required></div><div class="field"><label for="start">Начало аренды</label><input id="start" class="form-control" name="start" type="time" value="'+s.start+'" required></div><div class="field"><label for="end">Окончание аренды</label><input id="end" class="form-control" name="end" type="time" value="'+s.end+'" required></div><div class="field"><label for="courts">Количество кортов</label><input id="courts" class="form-control" name="courts" type="number" min="1" max="32" value="'+s.courts+'" '+(state.started?'disabled':'')+' required>'+ (state.started?'<small>Зафиксировано после запуска</small>':'')+'</div><div class="field"><label for="prepare-count">Встреч на табло «Приготовиться»</label><select id="prepare-count" class="form-control" name="prepareCount">'+[prepareMatchCount].map(n=>'<option value="'+n+'" selected>'+n+' встречи · '+n*2+' пар</option>').join('')+'</select></div></div><div id="settings-error" class="error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">'+icon('check')+'Сохранить параметры</button></div></form><div class="aside-stack" style="display:flex"><section class="panel form-panel"><h2>Разряды</h2><p>До 6 участников — круговая система, от 7 — швейцарская.</p>'+state.categories.map(c=>{const n=state.entries.filter(e=>e.category===c.id).length;return '<div class="config-row"><div>'+badge(c.id)+'<small>'+n+' '+(c.doubles?'пар':'участниц')+' · '+(n<7?'Круговая':'Швейцарская')+'</small></div>'+(n>=7?'<select class="form-control rounds-select" data-category="'+c.id+'" aria-label="Туров: '+esc(c.short)+'" '+(state.started?'disabled':'')+'><option value="4" '+(c.rounds===4?'selected':'')+'>4 тура</option><option value="5" '+(c.rounds===5?'selected':'')+'>5 туров</option></select>':'<span class="pill">'+(n-1)+' туров</span>')+'</div>';}).join('')+'</section>'+dayTools()+'</div></div>';
}
function board(){
 const upNext=preparingMatches();
 return '<div class="board" style="--division-count:'+Math.min(3,state.categories.length)+'"><header class="board-header"><a class="brand" href="#board"><span class="brand-mark">'+icon('court')+'</span><strong>SwissCourt</strong></a><div class="board-title">'+esc(state.settings.title)+' <span>· '+dateLabel()+' · '+simulationStatus()+'</span></div><div class="row">'+simulationControls()+'<time class="board-clock">'+time(gameNow())+'</time><button class="icon-btn" data-action="fullscreen" aria-label="На весь экран">'+icon('expand')+'</button></div></header><main class="board-tables" aria-label="Все турнирные таблицы">'+state.categories.map(c=>{
  const p=categoryProgress(c.id),count=state.entries.filter(e=>e.category===c.id).length;
  return '<section class="board-division" data-category="'+c.id+'"><div class="board-division-heading">'+badge(c.id)+'<strong>Тур '+p.round+' <span>/ '+p.rounds+'</span></strong><small>'+count+' '+(c.doubles?'пар':'участниц')+'</small></div>'+standingsTable(c.id,true)+'<div class="board-progress"><div class="spread"><span><b>'+p.done+'</b> сыграно</span><span><b>'+p.left+'</b> осталось</span></div><div class="progress"><span style="width:'+(p.total?p.done/p.total*100:0)+'%"></span></div></div></section>';
 }).join('')+'</main><section class="board-next"><div class="board-section-title"><h2>ПРИГОТОВИТЬСЯ</h2><span>Ближайшие встречи · дождитесь объявления организатора</span></div><div class="board-next-grid" style="--next-count:'+Math.min(4,Math.max(1,upNext.length))+'">'+upNext.map(m=>'<article class="board-next-match">'+matchup(m)+'</article>').join('')+(!upNext.length?'<p>Ожидайте следующего вызова</p>':'')+'</div></section><section class="board-current"><div class="board-section-title"><h2>СЕЙЧАС НА КОРТАХ</h2><span>Корона — первое место с учётом дополнительных показателей · = равенство</span></div><div class="board-courts" style="--court-count:'+Math.min(4,state.settings.courts)+';--total-courts:'+state.settings.courts+'">'+Array.from({length:state.settings.courts},(_,i)=>{
  const m=state.matches.find(m=>m.status==='playing'&&m.court===i+1);
  return '<article class="board-court '+(!m?'free':'')+'"><div class="board-court-number"><span>КОРТ</span><b>'+(i+1)+'</b></div>'+(m?'<div class="board-court-match"><div class="board-court-meta"><span class="time-'+C.courtTiming(elapsed(m.startedAt))+'"><b data-started="'+m.startedAt+'">'+elapsed(m.startedAt)+'</b> мин</span></div>'+matchup(m)+'</div>':'<strong class="board-court-empty">СВОБОДЕН</strong>')+'</article>';
 }).join('')+'</div></section></div>';
}
function render(){
 hideProgressTooltip();
 if(!state.categories.some(category=>category.id===selectedCategory))selectedCategory=state.categories[0].id;
 queuePositions=new Map(C.queue(state,gameNow()).map((match,index)=>[match.id,index+1]));
 if(boardMode){$('#app').innerHTML=board();if(typeof requestAnimationFrame==='function')requestAnimationFrame(fitBoardTables);return;}
 if(!['dashboard','participants','standings','results','settings'].includes(view))view='dashboard';
 const screens={dashboard,participants,standings,results,settings};
 const previous=$('#workspace-scroll')?.scrollTop||0;
 $('#app').innerHTML='<div class="operator '+(state.started?'is-live':'is-preparation')+'">'+topbar()+appNotice()+(state.started?courtsDock():'')+'<div class="workspace">'+nav()+'<main class="workspace-content" id="workspace-scroll">'+(storageError?'<div class="notice warn" role="alert">'+icon('info')+esc(storageError)+'</div>':'')+screens[view]()+'</main></div></div>';
 $('#workspace-scroll').scrollTop=previous;
}
function fitBoardTables(){
 // Keep every row visible when a division has more entrants or the display is shorter.
 document.querySelectorAll('.board-division .table-wrap').forEach(wrapper=>{
  const table=wrapper.querySelector('table');
  table.style.transform='';table.style.width='100%';table.style.height='100%';
  const bounds=table.getBoundingClientRect();
  if(!wrapper.clientHeight||!wrapper.clientWidth||!bounds.height||!bounds.width)return;
  const scale=Math.min(1,wrapper.clientHeight/bounds.height,wrapper.clientWidth/bounds.width);
  if(scale<1){table.style.width=(100/scale)+'%';table.style.height=(100/scale)+'%';table.style.transform='scale('+scale+')';}
 });
}

function dialog(title,subtitle,body,actions=''){
 const d=$('#dialog');if(d.open)d.close();d.innerHTML='<div class="dialog-header"><div><h2 id="dialog-title">'+title+'</h2><p>'+subtitle+'</p></div><button class="icon-btn" data-action="close" aria-label="Закрыть">'+icon('close')+'</button></div><div class="dialog-body">'+body+'</div>'+(actions?'<div class="dialog-actions">'+actions+'</div>':'');d.showModal();
}
function matchDetails(id,entryId){
 const m=state.matches.find(m=>m.id===id&&m.status==='done');if(!m)return;
 const result=C.validateScores(m.scores);if(!result.ok)return;
 const game=C.entryProgress(state,entryId).find(g=>g.matchId===id);
 dialog('Результат встречи',cat(m.category).name+' · Тур '+m.round,
  matchup(m,'detail-match')+'<div class="detail-score"><strong>'+result.wins.join(':')+'</strong><span>'+scoreText(m)+'</span></div>'+(game?'<p class="detail-outcome">'+esc(surnames(entryId))+' · '+(game.won?'победа':'поражение')+' '+game.setsFor+':'+game.setsAgainst+'</p>':''),
  '<button class="btn" data-action="close">Закрыть</button>'+(!boardMode&&mode!=='simulation'?'<button class="btn primary" data-action="score" data-id="'+m.id+'">'+icon('edit')+'Исправить результат</button>':''));
}
let progressAnchor=null;
function hideProgressTooltip(){
 const tooltip=$('#progress-tooltip');
 if(tooltip)tooltip.hidden=true;
 if(progressAnchor)progressAnchor.removeAttribute('aria-describedby');
 progressAnchor=null;
}
function showProgressTooltip(target){
 const game=C.entryProgress(state,target.dataset.entry).find(g=>g.matchId===target.dataset.id);
 if(!game)return;
 hideProgressTooltip();progressAnchor=target;
 const tooltip=$('#progress-tooltip');
 tooltip.innerHTML='<strong>'+(game.won?'Победа':'Поражение')+' '+game.setsFor+':'+game.setsAgainst+' · Тур '+game.round+'</strong><span>Соперники: '+esc(surnames(game.opponentId))+'</span><span>'+game.scores.map(score=>score.join(':')).join(' · ')+'</span>';
 tooltip.hidden=false;target.setAttribute('aria-describedby','progress-tooltip');
 const rect=target.getBoundingClientRect(),width=tooltip.offsetWidth,height=tooltip.offsetHeight;
 tooltip.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
 tooltip.style.top=(rect.top>height+16?rect.top-height-8:Math.min(window.innerHeight-height-8,rect.bottom+8))+'px';
}
document.addEventListener('pointerover',event=>{
 const target=event.target.closest('[data-action="match-details"]');
 if(target&&target!==progressAnchor)showProgressTooltip(target);
});
document.addEventListener('focusin',event=>{
 const target=event.target.closest('[data-action="match-details"]');if(target)showProgressTooltip(target);
});
document.addEventListener('pointerout',event=>{
 if(progressAnchor&&event.target.closest('[data-action="match-details"]')===progressAnchor&&!progressAnchor.contains(event.relatedTarget))hideProgressTooltip();
});
document.addEventListener('focusout',()=>hideProgressTooltip());
document.addEventListener('scroll',()=>hideProgressTooltip(),true);

const scoreAutoFill=new Map();
const cancel='<button class="btn" data-action="close">Отмена</button>';
function scoreDialog(id){
 const m=state.matches.find(m=>m.id===id);if(!m)return;scoreMatchId=id;scoreAutoFill.clear();
 const correction=m.status==='done',values=correction?m.scores:[];
 const body='<div class="score-context"><strong>'+(correction?'Тур '+m.round:'КОРТ '+m.court+' · Тур '+m.round)+'</strong></div><p class="score-entry-hint">0–18: сопернику — 21. Enter — дальше.</p><div class="score-head"><span>Участники</span><span>1 партия</span><span>2 партия</span><span>3 партия</span></div>'+[m.a,m.b].map((id,side)=>'<div class="score-team" id="score-team-'+side+'"><div class="score-team-label"><strong class="team-names">'+pairNames(id)+'</strong><span class="score-wins" id="score-wins-'+side+'">Партий: 0</span></div>'+[0,1,2].map(i=>'<input class="score-input" id="score-'+i+'-'+side+'" type="number" inputmode="numeric" min="0" max="30" step="1" aria-label="'+esc(surnames(id))+' — партия '+(i+1)+'" placeholder="—" value="'+(values[i]?.[side]??'')+'">').join('')+'</div>'+(side===0?'<div class="score-versus">'+versus(m)+'</div>':'')).join('')+'<div class="score-summary" id="score-summary" role="status" aria-live="polite">До двух выигранных партий. Третья нужна только при счёте 1:1.</div><div class="error" id="score-error" role="alert"></div>'+(correction?'<p class="dialog-note">Исправление попадёт в историю. Соперники следующих туров сохранятся.</p>':'');
 dialog(correction?'Исправить результат':'Результат встречи',correction?'Проверьте счёт по протоколу':'Сохранение результата освободит корт',body,(correction?'':'<button class="btn ghost danger" data-action="return-queue" data-id="'+m.id+'">Вернуть в очередь</button>')+'<button class="btn primary" data-action="save-score">'+icon('check')+'Сохранить результат</button>');
 updateScore();setTimeout(()=>$('#score-0-0')?.focus(),40);
}

function rawScores(){return [0,1,2].map(i=>[0,1].map(side=>$('#score-'+i+'-'+side).value));}
function autoCompleteScore(input){
 const [,game,side]=input.id.split('-'),other=$('#score-'+game+'-'+(1-Number(side)));
 // Editing an automatic value makes it manual. Never overwrite a manual score.
 scoreAutoFill.delete(input.id);
 const automatic=scoreAutoFill.get(other.id)===input.id;
 const number=Number(input.value),low=input.value!==''&&Number.isInteger(number)&&number>=0&&number<19;
 if(low&&(other.value===''||automatic)){
  other.value='21';scoreAutoFill.set(other.id,input.id);
 }else if(!low&&automatic){
  if(other.value==='21')other.value='';
  scoreAutoFill.delete(other.id);
 }
}
function updateScore(){
 const raw=rawScores(),firstTwo=raw.slice(0,2);
 const canDecide=firstTwo.every(s=>s.every(x=>x!=='')&&C.validGame(Number(s[0]),Number(s[1])));
 const straight=canDecide&&(Number(raw[0][0])>Number(raw[0][1]))===(Number(raw[1][0])>Number(raw[1][1]));
 [0,1].forEach(side=>{
  const input=$('#score-2-'+side);input.disabled=straight;
  if(straight){input.value='';scoreAutoFill.delete(input.id);}
 });
 const scores=rawScores(),wins=[0,0];
 scores.forEach((game,i)=>{
  const valid=game.every(x=>x!=='')&&C.validGame(Number(game[0]),Number(game[1]));
  const winner=valid?(Number(game[0])>Number(game[1])?0:1):-1;
  if(valid)wins[winner]++;
  [0,1].forEach(side=>$('#score-'+i+'-'+side).classList.toggle('game-won',winner===side));
 });
 const result=C.validateScores(scores),m=state.matches.find(m=>m.id===scoreMatchId);
 [0,1].forEach(side=>{
  const winner=result.ok&&result.winner===side,row=$('#score-team-'+side);
  row.classList.toggle('match-winner',winner);
  row.classList.toggle('is-leading',!result.ok&&wins[side]>wins[1-side]);
  $('#score-wins-'+side).textContent=winner?'Победа · 2 партии':'Партий: '+wins[side];
 });
 $('#score-summary').textContent=result.ok?'Победа: '+surnames(result.winner===0?m.a:m.b)+' · '+result.wins.join(':'):
  'Партии '+wins.join(':')+'. '+(wins[0]===1&&wins[1]===1?'Заполните решающую партию.':'До двух выигранных партий.');
 $('#score-error').textContent='';
}
let preferredCourt=null;
function assignDialog(id,court){
 const m=state.matches.find(m=>m.id===id),free=freeCourts();
 if(!m)return;
 if(!C.matchAvailability(state,m).available){toast(blockersText(m).join('. '));return;}
 if(!free.length){toast('Все корты заняты. Сначала внесите результат.');return;}
 assignMatchId=id;const mins=C.restMinutes(state,m,gameNow());
 dialog('Вызвать на корт',cat(m.category).code+' · Тур '+m.round,matchup(m,'assign-match')+'<div class="court-options">'+free.map((n,i)=>'<label class="court-option"><input type="radio" name="court" value="'+n+'" '+(n===Number(court)||(!free.includes(Number(court))&&i===0)?'checked':'')+'>Корт <b>'+n+'</b></label>').join('')+'</div>'+restLabel(m)+(mins!==null&&mins<15?'<div class="notice warn">'+icon('clock')+'Минимальный отдых — '+mins+' мин. Рекомендуется 15 минут, но вы можете вызвать участников сейчас.</div>':'<p class="dialog-note">Объявите участников и номер корта в микрофон.</p>'),cancel+'<button class="btn primary" data-action="start-match">'+icon('court')+'Назначить и вызвать</button>');
}

function editEntryDialog(id){
 const e=id?entry(id):{id:null,category:filter==='all'?state.categories[0].id:filter,players:[{name:'',rating:''},{name:'',rating:''}]},locked=state.started;
 const doubles=cat(e.category).doubles;
 const playerFields=side=>'<div class="field"><label for="player-'+side+'">Игрок '+(side+1)+' · имя и фамилия</label><input class="form-control" id="player-'+side+'" value="'+esc(e.players[side]?.name||'')+'" maxlength="70" required '+(locked?'disabled':'')+'></div><div class="field"><label for="rating-'+side+'">Индивидуальный рейтинг</label><input class="form-control" id="rating-'+side+'" type="number" min="0" max="99999" step="0.5" value="'+(e.players[side]?.rating??'')+'" required '+(locked?'disabled':'')+'></div>';
 dialog(locked?'Данные участника':id?'Редактировать участника':'Добавить участника',locked?'Состав зафиксирован после запуска':'Рейтинг пары — среднее индивидуальных рейтингов','<form id="entry-form" data-id="'+(id||'')+'"><div class="form-grid"><div class="field full"><label for="entry-category">Разряд</label><select class="form-control" id="entry-category" '+(id||locked?'disabled':'')+'>'+state.categories.map(c=>'<option value="'+c.id+'" '+(e.category===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div>'+playerFields(0)+'<div id="second-player" class="field full" style="'+(!doubles?'display:none':'')+'"><div class="form-grid">'+playerFields(1)+'</div></div></div><div id="entry-error" class="error" role="alert"></div></form>',locked?'<button class="btn" data-action="close">Закрыть</button>':cancel+'<button class="btn primary" data-action="save-entry">'+icon('check')+'Сохранить</button>');
}
function saveEntry(){
 const form=$('#entry-form'),id=form.dataset.id,category=$('#entry-category').value,count=cat(category).doubles?2:1,players=[];
 for(let side=0;side<count;side++){const name=$('#player-'+side).value.trim().replace(/\s+/g,' '),raw=$('#rating-'+side).value,rating=Number(raw);if(name.split(' ').length<2||raw===''||!Number.isFinite(rating)||rating<0||rating>99999){$('#entry-error').textContent='Укажите имя, фамилию и рейтинг каждого игрока (0–99999).';return;}players.push({name,rating});}
 const normalized=name=>name.toLocaleLowerCase().replace(/ё/g,'е').trim().replace(/\s+/g,' ');
 const known=state.entries.filter(e=>e.id!==id).flatMap(e=>e.players.map(p=>normalized(p.name)));
 if(players.some(p=>known.includes(normalized(p.name)))||players.length===2&&normalized(players[0].name)===normalized(players[1].name)){$('#entry-error').textContent='Игрок с таким именем уже есть в игровом дне. Проверьте составы.';return;}
 if(mutate(s=>{if(s.started)throw Error('Состав уже зафиксирован.');if(id){const existing=s.entries.find(e=>e.id===id);existing.players=players;existing.category=category;}else s.entries.push({id:'entry-'+crypto.randomUUID(),category,players});},'Участник сохранён'))$('#dialog').close();
}
let draft=[];
function drawDialog(){
 if(mode==='real'){realDrawDialog();return;}
 if(state.started){toast('Первый тур уже опубликован.');return;}draft=[];
 const unsupported=state.categories.find(c=>{const n=state.entries.filter(e=>e.category===c.id).length;return n<2||n%2===1;});
 if(unsupported){dialog('Проверка состава','Первый тур','<p>В разряде «'+esc(unsupported.name)+'» '+state.entries.filter(e=>e.category===unsupported.id).length+' участников / пар.</p><div class="notice warn" style="margin-top:15px">'+icon('info')+'В этом эскизе можно опробовать жеребьёвку на чётном составе от двух участников. Сценарий bye будет добавлен при реализации спортивного алгоритма.</div>','<button class="btn" data-action="close">Вернуться к составам</button>');return;}
 for(const c of state.categories)C.firstPairs(state.entries.filter(e=>e.category===c.id)).forEach(([a,b],i)=>draft.push({id:'round1-'+c.id+'-'+i,category:c.id,a,b,round:1,status:'queued',pinned:false}));
 dialog('Первый тур','Предварительный просмотр пар',draft.map(m=>'<div class="history-entry">'+matchup(m)+'</div>').join('')+'<p style="margin-top:17px;font-size:11px">После публикации составы фиксируются, встречи появляются в очереди. Для оценки в сценарии подготовки доступен первый тур.</p>',cancel+'<button class="btn primary" data-action="publish-draw">Опубликовать и начать'+icon('arrow')+'</button>');
}
function exportCsv(){
 const quote=v=>{let value=String(v);if(typeof v==='string'&&/^\s*[=+@-]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';};
 const rows=T.standings(state,selectedCategory);
 const swiss=rows.length>=7;
 const lines=[['Игрок 1','Игрок 2','Место','Очки',...(swiss?['Соперники','Побежденные']:[]),'Игры','Победы','Поражения','Партии выиграны','Партии проиграны','Игровые очки выиграны','Игровые очки проиграны','Равенство'],...rows.map(r=>[r.entry.players[0].name,r.entry.players[1]?.name||'',r.place,r.points,...(swiss?[coefficient(r.buchholz),coefficient(r.berger)]:[]),r.played,r.wins,r.losses,r.setsFor,r.setsAgainst,r.ballFor,r.ballAgainst,r.tied?'Да':''])];
 const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SwissCourt-'+(mode==='real'?'':'DEMO-')+selectedCategory+'-'+state.settings.date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV сохранён с очками, показателями и текущими местами.');
}
function switchScenario(value){mode=value==='prep'?'prep':'live';loadState();if(mode!=='real')C.ensureRoundRobinSchedule(state);lookupQuery='';filter='all';query='';view='dashboard';history.replaceState(null,'','?scenario='+mode+'#dashboard');render();toast(mode==='prep'?'Открыт отдельный сценарий подготовки':'Открыт сценарий идущего турнира');}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');if(!target)return;
 const action=target.dataset.action,id=target.dataset.id;
 switch(action){
 case 'close':$('#dialog').close();preferredCourt=null;break;
 case 'close-lookup':lookupQuery='';$('#player-lookup').value='';$('#player-lookup').setAttribute('aria-expanded','false');$('#lookup-results').hidden=true;break;
 case 'filter':filter=id;render();break;
 case 'category':selectedCategory=id;render();break;
 case 'simulation-pause':controlSimulation();break;
 case 'simulation-restart':controlSimulation(true);break;
 case 'bye-details':{
  const bye=(state.byes||[]).find(bye=>bye.id===id);if(!bye)break;
  dialog('Пропуск тура',cat(bye.category).code+' · Тур '+bye.round,
   '<p><strong>'+esc(surnames(bye.entryId))+'</strong></p><p>В разряде нечётное число пар. В этом туре соперника нет. Начислено 1 очко; встреча и победа не засчитываются. Повторного пропуска у этой пары не будет.</p>',
   '<button class="btn" data-action="close">Закрыть</button>');break;
 }
 case 'score':if(mode==='real'&&state.closed){toast('Откройте день для исправления в настройках.');break;}if(mode==='simulation'){toast('Результаты симуляции вводятся автоматически.');break;}scoreDialog(id);break;
 case 'match-details':hideProgressTooltip();matchDetails(id,target.dataset.entry);break;
 case 'save-score':{
  const result=C.validateScores(rawScores());if(!result.ok){$('#score-error').textContent=result.error;return;}
  const m=state.matches.find(m=>m.id===scoreMatchId),oldCourt=m.court,correcting=m.status==='done';
  let corrected=null;
  if(mutate(s=>{if(mode==='real')corrected=T.finish(s,scoreMatchId,result.scores);else C.finish(s,scoreMatchId,result.scores);},correcting?'Результат исправлен. Изменение записано в историю.':'Результат сохранён. Корт '+oldCourt+' свободен.')){$('#dialog').close();if(corrected?.redraw)offerRedraw(corrected.redraw);}break;
 }
 case 'return-queue':dialog('Вернуть встречу в очередь?','Корт освободится без результата','<p>Соперники останутся прежними. Введённый, но не сохранённый счёт будет очищен.</p>',cancel+'<button class="btn primary" data-action="confirm-return" data-id="'+id+'">Вернуть в очередь</button>');break;
 case 'confirm-return':if(mutate(s=>C.returnToQueue(s,id),'Встреча возвращена в очередь, корт свободен.'))$('#dialog').close();break;
 case 'pin':mutate(s=>{const m=s.matches.find(m=>m.id===id);if(!C.matchAvailability(s,m).available)throw Error('Пока нельзя готовить эту встречу: игрок занят или предыдущий тур не завершён.');if(!m.pinned&&s.matches.filter(m=>m.status==='queued'&&m.pinned).length>=prepareMatchCount)throw Error('На табло уже отмечены 4 встречи (8 пар). Уберите одну отметку.');m.pinned=!m.pinned;},'Блок «Приготовиться» обновлён');break;
 case 'assign':assignDialog(id,preferredCourt);preferredCourt=null;break;
 case 'choose-match':{
  preferredCourt=Number(target.dataset.court);const list=C.queueItems(state,gameNow());dialog('Встреча на корт '+preferredCourt,'Выберите участников из очереди',list.length?list.map((m,i)=>queueRow(m,i,true)).join(''):'<p>В очереди пока нет доступных встреч.</p>');break;
 }
 case 'start-match':{const court=Number($('input[name="court"]:checked')?.value);if(mutate(s=>C.assign(s,assignMatchId,court),'Встреча назначена на корт '+court+'. Объявите участников.'))$('#dialog').close();break;}
 case 'edit-entry':editEntryDialog(id);break;
 case 'save-entry':saveEntry();break;
 case 'remove-entry':dialog('Удалить участника?','Из состава этого игрового дня','<p>'+fullNames(id)+'</p>',cancel+'<button class="btn danger" data-action="confirm-remove" data-id="'+id+'">Удалить из состава</button>');break;
 case 'confirm-remove':if(mutate(s=>{if(s.started)throw Error('Состав уже зафиксирован.');s.entries=s.entries.filter(e=>e.id!==id);},'Участник удалён из состава'))$('#dialog').close();break;
 case 'draw':drawDialog();break;
 case 'publish-draw':if(mode==='real'){publishRealDraw();break;}if(mutate(s=>{if(s.started)throw Error('Тур уже опубликован.');s.matches=structuredClone(draft);s.started=true;C.ensureRoundRobinSchedule(s);},'Первый тур опубликован. Можно вызывать участников.')){$('#dialog').close();location.hash='dashboard';}break;
 case 'export':exportCsv();break;
 case 'board':{
  if(!storageError&&mode!=='simulation'&&mode!=='real'){try{localStorage.setItem(storageKey(),JSON.stringify(state));}catch(error){toast('Не удалось передать состояние табло. Хранилище недоступно.');return;}}
  const url=new URL(location.href);url.search='?scenario='+mode;url.hash='board';const tab=window.open(url.href,'swisscourt-board-'+mode);if(!tab)toast('Разрешите открытие новой вкладки для табло.');break;
 }
 case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen().catch(()=>toast('Не удалось выйти из полноэкранного режима'));else document.documentElement.requestFullscreen().catch(()=>toast('Полноэкранный режим недоступен в этом браузере'));break;
 case 'import':importDialog();break;
 case 'history':dialog('История исправлений','Исходный и изменённый счёт',state.history.length?state.history.map(h=>{const m=state.matches.find(m=>m.id===h.matchId);return '<div class="history-entry">'+matchup(m)+'<small>'+time(h.at)+' · '+h.old.map(s=>s.join(':')).join(', ')+' → '+h.new.map(s=>s.join(':')).join(', ')+'</small></div>';}).join(''):'<p>Исправлений пока нет. Они появятся здесь после изменения сохранённого результата.</p>','<button class="btn" data-action="close">Закрыть</button>');break;
 case 'reset':dialog('Начать сценарий заново?','Только текущий демонстрационный сценарий','<p>Внесённые в этот сценарий результаты, участники и параметры будут заменены исходным демо-набором. Второй сценарий сохранится.</p>',cancel+'<button class="btn danger" data-action="confirm-reset">Сбросить демо-данные</button>');break;
 case 'confirm-reset':if(persist(C.seed(mode))){$('#dialog').close();view='dashboard';location.hash='dashboard';render();toast('Демонстрационный сценарий восстановлен.');}break;
 case 'about':dialog('SwissCourt 1.0.0','Проведение турнира по бадминтону','<p>Швейцарская система на 4–5 туров и круговая для 2–6 участников. Очередь, корты, результаты и табло работают на вашем устройстве без интернета после подготовки автономного режима.</p><p>Данные сохраняются автоматически. Резервная копия доступна в настройках. Демо и симуляция хранятся отдельно от вашего турнира.</p><p>Технические поражения, снятия и дополнительные встречи при полном равенстве не автоматизированы. Не вводите фиктивный счёт вместо неявки.</p>','<button class="btn primary" data-action="close">Закрыть</button>');break;
 }
});
document.addEventListener('input',event=>{
 if(event.target.classList.contains('score-input')){autoCompleteScore(event.target);updateScore();}
 if(event.target.id==='player-lookup'){
  lookupQuery=event.target.value;
  $('#lookup-results').innerHTML=lookupResults();$('#lookup-results').hidden=!lookupQuery.trim();
  event.target.setAttribute('aria-expanded',String(Boolean(lookupQuery.trim())));
 }
 if(event.target.id==='participant-search'){
  const pos=event.target.selectionStart;query=event.target.value;render();const input=$('#participant-search');input.focus();if(input.type!=='search'||pos!==null)try{input.setSelectionRange(pos,pos);}catch{}
 }
});
document.addEventListener('focusin',event=>{
 if(event.target.classList?.contains('score-input'))event.target.select();
});
document.addEventListener('change',event=>{
 if(event.target.id==='scenario'||event.target.id==='settings-scenario')switchScenario(event.target.value);
 if(event.target.id==='entry-category')$('#second-player').style.display=cat(event.target.value).doubles?'':'none';
 if(event.target.classList.contains('rounds-select'))mutate(s=>{if(s.started)throw Error('Число туров зафиксировано.');s.categories.find(c=>c.id===event.target.dataset.category).rounds=Number(event.target.value);},'Количество туров сохранено');
});
document.addEventListener('submit',event=>{
 event.preventDefault();if(event.target.id!=='settings-form')return;
 const data=new FormData(event.target),values=Object.fromEntries(data);
 if(values.end<=values.start){$('#settings-error').textContent='Окончание аренды должно быть позже начала.';return;}
 values.courts=state.started?state.settings.courts:Number(values.courts);values.prepareCount=Number(values.prepareCount);
 if(!Number.isInteger(values.courts)||values.courts<1||values.courts>32){$('#settings-error').textContent='Укажите от 1 до 32 кортов.';return;}
 for(const key of ['title','venue','level']){values[key]=values[key].trim();if(!values[key]){$('#settings-error').textContent='Заполните название, зал и дивизион.';return;}}
 mutate(s=>{Object.assign(s.settings,values);},'Параметры игрового дня сохранены');
});
window.addEventListener('hashchange',()=>{if(boardMode)return;view=location.hash.slice(1)||'dashboard';filter='all';query='';lookupQuery='';render();$('#workspace-scroll').scrollTop=0;});
window.addEventListener('storage',event=>{if(mode==='simulation'&&event.key===simulationStorageKey){initSimulation();refreshSimulation(true);return;}if(event.key===storageKey()){loadState();if(mode!=='real')C.ensureRoundRobinSchedule(state);if($('#dialog').open){$('#dialog').close();toast('Данные изменились в другой вкладке. Откройте встречу заново.');}render();}});
window.addEventListener('resize',()=>{if(boardMode)fitBoardTables();});
document.addEventListener('visibilitychange',()=>{if(mode==='simulation'&&!document.hidden)refreshSimulation(true);});
setInterval(()=>{
 if(mode==='simulation')refreshSimulation();
 document.querySelectorAll('[data-started]').forEach(el=>{
  const minutes=elapsed(Number(el.dataset.started));el.textContent=minutes;
  const parent=el.parentElement;
  ['called','normal','long','delayed'].forEach(status=>parent.classList.toggle('time-'+status,status===C.courtTiming(minutes)));
 });
 const clock=document.querySelector('.board-clock');if(clock)clock.textContent=time(gameNow());
},1000);
setInterval(()=>{
 const editing=['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName);
 if(mode!=='simulation'&&!$('#dialog').open&&!editing&&!lookupQuery&&!progressAnchor)render();
},30000);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape')hideProgressTooltip();
 if(event.key==='Escape'&&lookupQuery){lookupQuery='';$('#player-lookup').value='';$('#player-lookup').setAttribute('aria-expanded','false');$('#lookup-results').hidden=true;}
 if(event.key==='Enter'&&event.target.classList.contains('score-input')){
  event.preventDefault();const order=['score-0-0','score-0-1','score-1-0','score-1-1','score-2-0','score-2-1'].map(id=>document.getElementById(id)).filter(el=>!el.disabled);
  const next=order.slice(order.indexOf(event.target)+1).find(input=>!scoreAutoFill.has(input.id));if(next)next.focus();else document.querySelector('[data-action="save-score"]').focus();
 }
});
