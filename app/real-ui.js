'use strict';
let realDraft=null,importPreview=null,importRequest=0,backupPreview=null;
const A=SwissCourtScheduling;
let scheduleJob=null,scheduledSignature='',scheduleError='';
async function scheduleReadyMatches(force=false){
 if(mode!=='real'||boardMode||!editorReady||storageError||!state.started||state.closed){if(scheduleJob){scheduleJob.cancelled=true;scheduleJob.worker?.terminate();scheduleJob=null;}return;}
 const signature=A.signature(state);
 if(!force&&(scheduleJob?.signature===signature||scheduledSignature===signature))return;
 if(scheduleJob){scheduleJob.cancelled=true;scheduleJob.worker?.terminate();}
 const job={signature,cancelled:false,worker:null};scheduleJob=job;scheduleError='';
 const snapshot=structuredClone(state);
 try{
  for(const category of snapshot.categories){
   if(T.schemeOf(snapshot,category.id)!=='swiss')continue;
   const proposal=typeof Worker==='function'?await new Promise((resolve,reject)=>{
    const worker=new Worker('./scheduling-worker.js');job.worker=worker;
    worker.onmessage=event=>{worker.terminate();job.worker=null;event.data.error?reject(Error(event.data.error)):resolve(event.data.proposal);};
    worker.onerror=()=>{worker.terminate();job.worker=null;reject(Error('Не удалось рассчитать досрочные встречи.'));};
    worker.postMessage({state:snapshot,category:category.id});
   }):await Promise.resolve().then(()=>A.plan(snapshot,category.id));
   if(job.cancelled||scheduleJob!==job||A.signature(state)!==signature)return;
   if(proposal){
    // Pin/court changes do not affect the proof. Rebase only after verifying
    // the full pairing-input signature, never just the round or game count.
    proposal.revision=state.revision;
    const next=structuredClone(state);A.apply(next,proposal);
    scheduleJob=null;
    if(persist(next)){render();if(proposal.matches.length)toast('В очередь добавлено встреч: '+proposal.matches.length+(proposal.complete?'':' · можно вызывать до окончания тура'));}
    return;
   }
  }
  if(scheduleJob===job){scheduledSignature=signature;scheduleJob=null;}
 }catch(error){if(!job.cancelled&&scheduleJob===job){scheduleError=error.message;scheduleJob=null;scheduledSignature=signature;render();toast(error.message);}}
}
function appNotice(){
 if(mode!=='real')return '<div class="app-notice">Демонстрация · данные вымышленные. <a href="./">Открыть мой турнир</a></div>';
 if(!editorReady&&!boardMode)return '<div class="app-notice" role="status">'+(editorBusy?'Этот день уже открыт для редактирования в другой вкладке. Здесь доступен просмотр.':'Подключение к локальному игровому дню…')+' <button class="btn small" data-action="editor">Продолжить здесь</button></div>';
 return '';
}
async function acquireEditor(){
 if(mode!=='real'||boardMode||editorReady)return;
 if(!navigator.locks){storageError='Для надёжной работы откройте приложение в актуальном Chrome, Edge или Safari с поддержкой Web Locks.';render();return;}
 await navigator.locks.request('swisscourt-day-editor',{ifAvailable:true},async lock=>{
  if(!lock){editorBusy=true;render();return;}
  editorReady=true;editorBusy=false;loadState();render();
  if(!storageError&&!localStorage.getItem(D.key))persist(state);
  scheduleReadyMatches();
  navigator.storage?.persist?.().catch(()=>{});
  await new Promise(()=>{}); // Released by the browser when this organizer tab closes.
 });
}
function roundControls(){
 if(!state.started)return '';
 return '<div class="round-controls">'+state.categories.map(c=>{
  const r=T.roundStatus(state,c.id),swiss=T.schemeOf(state,c.id)==='swiss';
  return '<div>'+badge(c.id)+'<span>'+(r.complete?'Все встречи завершены':esc(stageSummary(c.id)))+(r.partial?' · встречи тура '+r.round+' добавляются досрочно':'')+'</span>'+(r.canDraw?'<button class="btn primary small" data-action="next-round" data-id="'+c.id+'">Сформировать тур '+(r.round+1)+'</button>':'')+(!state.closed&&swiss&&!r.partial&&r.round>1&&state.matches.filter(m=>m.category===c.id&&m.round===r.round).every(m=>m.status==='queued')?'<button class="btn small" data-action="offer-redraw" data-id="'+c.id+'">Пересчитать тур</button>':'')+'</div>';
 }).join('')+(scheduleError?'<button class="btn small" data-action="retry-scheduling">Повторить расчёт очереди</button>':'')+'</div>';
}
function dayTools(){
 const real=mode==='real';
 return '<section class="panel form-panel"><h2>Игровой день</h2>'+(real?'<p>Изменения сохраняются автоматически на этом устройстве. Резервный файл позволяет перенести день или восстановить его после очистки браузера.</p><div class="day-actions"><button class="btn" data-action="backup">'+icon('download')+'Резервная копия</button><label class="btn">Восстановить из файла<input id="restore-file" type="file" accept=".json,application/json" hidden></label>'+(recoveryState?'<button class="btn" data-action="recover">Восстановить предыдущую запись</button>':'')+(state.closed?'<button class="btn" data-action="reopen-day">Открыть для исправления</button>':'')+'<button class="btn" data-action="new-day">Новый турнир</button>'+'</div>':'<a class="btn primary" href="./">Мой турнир</a>')+'<p class="muted" style="margin-top:16px">Демо: <a href="?scenario=live">7 кортов</a> · <a href="?scenario=simulation#board">Симуляция</a></p></section><section class="panel form-panel"><h2>Без интернета</h2><p id="offline-explanation">'+(offlineReady?'Приложение загружено для автономной работы. Можно отключить интернет.':'Пока автономная загрузка не подтверждена. Откройте приложение с интернетом и дождитесь отметки «Офлайн готов».')+'</p><p>На телефоне: меню браузера → «Установить приложение» или «На экран Домой». На компьютере: значок установки в адресной строке.</p></section>';
}
function realDrawDialog(category){
 try{
  if(!state.started){
   const missing=state.categories.find(c=>!T.preparedOrder(state,c.id));
   if(missing){
    rosterCategory=missing.id;view='participants';location.hash='participants';render();
    toast('Проведите жеребьёвку категории '+categoryLabel(missing)+'.');
    return;
   }
   const next=structuredClone(state);
   T.start(next);
   realDraft={first:true,revision:state.revision,next};
   const preview=next.categories.map(c=>{
    const n=next.entries.filter(e=>e.category===c.id).length,scheme=T.schemeOf(next,c.id);
    const groups=scheme==='groups'?T.bracketContext(next,c.id).groups.map((ids,i)=>'<p><strong>Группа '+B.groupNumber(i)+'</strong> · '+ids.map(id=>esc(surnames(id))).join(' · ')+'</p>').join(''):'';
    const matches=next.matches.filter(m=>m.category===c.id&&m.round===1);
    const mismatch=c.planned&&c.planned!==n?'<p class="notice warn">Планировалось '+c.planned+', фактически '+n+'. Расчёт по фактическому составу.</p>':'';
    return '<section class="draw-preview"><h3>'+esc(categoryLabel(c))+'</h3><p>'+esc(B.schemes[scheme])+' · '+C.formatOf(next,c.id).label+' · '+T.totalMatches(next,c.id)+' встреч</p>'+
     mismatch+groups+matches.map(m=>'<div class="history-entry">'+matchup(m)+'</div>').join('')+byeDraft(next.byes.filter(b=>b.category===c.id&&b.round===1))+'</section>';
   }).join('');
   const forecast=P.estimate(next,{actual:true,now:next.startedAt});
   dialog('Запустить турнир','Проверьте составы и первые встречи',timingStatus(forecast)+preview,
    cancel+'<button class="btn primary" data-action="publish-draw">Начать турнир</button>');
  }else{
   const r=T.roundStatus(state,category);if(!r.canDraw)throw Error('Завершите текущий тур или проверьте число туров.');
   const proposal=T.draw(state,category,r.round+1);realDraft={revision:state.revision,proposal};
   dialog('Тур '+proposal.round,cat(category).code+' · предварительная жеребьёвка',proposal.matches.map(m=>'<div class="history-entry">'+matchup(m)+'</div>').join('')+byeDraft(proposal.bye?[proposal.bye]:[]),cancel+'<button class="btn primary" data-action="publish-draw">Опубликовать тур</button>');
  }
 }catch(error){toast(error.message);}
}
function byeDraft(byes){return byes.map(b=>'<p class="notice">'+badge(b.category)+'Пропускает тур: '+esc(surnames(b.entryId))+' · +1 очко</p>').join('');}
function publishRealDraw(){
 if(!realDraft)return;
 if(realDraft.revision!==state.revision){toast('Данные изменились. Откройте жеребьёвку заново.');return;}
 if(realDraft.first)realDraft.next.startedAt=gameNow();
 if(realDraft.first?persist(realDraft.next):mutate(s=>T.publish(s,realDraft.proposal),'Тур опубликован. Можно вызывать встречи.')){$('#dialog').close();view='dashboard';location.hash='dashboard';realDraft=null;render();}
}
function offerRedraw(category){
 dialog('Пересчитать следующий тур?',cat(category).code,'<p>Новый счёт учитывается в таблице. Следующий тур ещё не начался: можно пересчитать пары по обновлённым очкам. При отказе опубликованные соперники сохранятся.</p>',cancel+'<button class="btn primary" data-action="redraw" data-id="'+category+'">Пересчитать</button>');
}
function downloadFile(name,content,type){
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function backup(){downloadFile('SwissCourt-'+state.settings.date+'.json',JSON.stringify(state,null,2),'application/json');}
function sendLeagueResults(){
 if(mode!=='real'||!state.closed)return;
 const rows=[['Разряд','Группа','Игрок 1','Игрок 2','Место']];
 for(const category of state.categories){
  const code=['MS','WS','MD','WD','XD'].includes(category.code)?category.code:'';
  const group=category.name.trim().match(/[+\-−]$/)?.[0]||'';
  for(const result of T.standings(state,category.id)){
   const [first,second]=result.entry.players;
   rows.push([code,group,C.playerFullName(first),C.playerFullName(second),result.place??'']);
  }
 }
 const csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const target=new URL('https://d5dvlojr96994pqpp0e9.6brbn2wz.apigw.yandexcloud.net/');
 const levelLabels={ПРОСПОРТ:'prosport',СТАРТ:'start'};
 const label=state.settings.level.trim().toLocaleUpperCase('ru');
 const level=Object.hasOwn(levelLabels,label)?levelLabels[label]:null;
 target.search=new URLSearchParams({view:'admin',section:'results',date:state.settings.date,...(level?{level}:{})});
 target.hash=new URLSearchParams({swisscourt:csv});
 window.open(target.href,'_blank','noopener,noreferrer');
}
function importTargets(data){
 const {code,selection}=data;
 return state.categories.filter(c=>c.code===code||!selection&&(c.code==='S'&&['MS','WS'].includes(code)||c.code==='D'&&['MD','WD','XD'].includes(code)));
}
function importDialog(){
 if(state.started){toast('Импорт доступен до начала турнира.');return;}
 importPreview=null;importRequest++;
 dialog('Импорт из Бадминтюна','Сначала предпросмотр, затем добавление','<div class="field"><label for="import-url">Ссылка на турнир или разряд</label><input class="form-control" id="import-url" type="url" placeholder="https://msk.volan.web-us.ru/tournament/…"></div><p>Импортируются основные заявки выбранного разряда. Резерв и неполные пары пропускаются.</p><div id="import-status" role="status"></div>',cancel+'<button class="btn primary" data-action="fetch-import">Загрузить</button>');
}
function leagueImportDialog(){
 if(mode!=='real'||state.started||!editorReady)return;
 importPreview=null;
 dialog('Импорт из Клубной лиги 8Я','','<div id="import-status" role="status"></div>',cancel+'<button class="btn" data-action="fetch-league-catalog">Обновить</button>');
 return fetchImport({source:'league'});
}
function showLeagueCatalog(tours){
 const active=activeRosterCategory();
 const selected=state.entries.find(entry=>entry.category===active.id&&entry.leagueSource)?.leagueSource||
  tours.find(tour=>tour.date===state.settings.date)?.categories.find(item=>item.levelLabel===state.settings.level&&item.code===active.code)?.selection;
 dialog('Импорт из Клубной лиги 8Я','','<div class="field"><label for="league-selection">Тур, уровень и разряд</label>'+
  '<select class="form-control" id="league-selection">'+tours.map(tour=>'<optgroup label="'+esc('Тур '+tour.number+' · '+tour.date.split('-').reverse().join('.'))+'">'+
  tour.categories.map(item=>'<option value="'+esc(item.selection)+'" '+(selected===item.selection?'selected':'')+'>'+esc(item.levelLabel+' · '+item.name+' ('+item.code+')')+'</option>').join('')+
  '</optgroup>').join('')+'</select></div><p>Загружаются подтверждённые заявки основного списка.</p><div id="import-status" role="status"></div>',
  cancel+'<button class="btn primary" data-action="fetch-league-roster">Показать заявки</button>');
}
async function fetchImport(payload){
 const requestId=++importRequest;
 const status=$('#import-status');status.textContent='Загрузка…';
 try{
  const response=await fetch('./api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Источник недоступен.');
  if(!$('#dialog').open||!$('#import-status')||requestId!==importRequest)return;
  if(payload.source==='league'&&data.tours){showLeagueCatalog(data.tours);return;}
  if(data.categories){
   dialog('Выберите разряд BadminTune',data.name||'Турнир',data.categories.map(c=>'<button class="btn import-category" data-action="fetch-category" data-url="'+esc(c.url)+'">'+esc(c.name)+'</button>').join('')+'<div id="import-status" role="status"></div>',cancel);return;
  }
  importPreview=data;
  showImportPreview(data);
 }catch(error){if($('#dialog').open&&$('#import-status')&&requestId===importRequest)$('#import-status').textContent='Не удалось импортировать: '+error.message+' Состав не изменён.';}
}
function showImportPreview(data){
 const fromLeague=Boolean(data.selection),previous=state.entries.find(entry=>entry.leagueSource===data.selection&&fromLeague);
 const targets=importTargets(data),preferred=previous?.category||(mode==='real'?activeRosterCategory().id:null);
 const addCategory=fromLeague&&!targets.length&&state.categories.length<5;
 const label=previous?'Обновить состав':'Добавить в состав';
 const subtitle=[data.name,data.levelLabel,data.date?.split('-').reverse().join('.'),data.entries.length+' заявок'].filter(Boolean).join(' · ');
 dialog('Проверьте импорт',esc(subtitle),
  '<div class="field"><label for="import-target">Категория SwissCourt</label><select id="import-target" class="form-control">'+
  targets.map(c=>'<option value="'+c.id+'" '+(preferred===c.id?'selected':'')+'>'+esc(c.code+' · '+c.name)+'</option>').join('')+
  (addCategory?'<option value="new">Создать категорию '+esc(data.code)+'</option>':'')+'</select></div>'+
  (!targets.length&&!addCategory?'<p class="notice warn">Сначала добавьте разряд '+esc(data.code)+' в настройках.</p>':'')+
  (data.warnings||[]).map(w=>'<p class="notice warn">'+esc(w)+'</p>').join('')+
  '<div class="import-list">'+data.entries.map(e=>'<p>'+e.players.map(p=>esc(C.playerFullName(p))+' · '+(p.rating===null?'рейтинг не указан':p.rating)).join(' / ')+'</p>').join('')+'</div>'+
  (fromLeague?'<p>В игровой день будут подставлены дата, зал и уровень из лиги.</p>':'')+
  (previous?'<p>Обновятся ранее загруженные заявки этого разряда. Если заявку сняли или перенесли в резерв, она уйдёт из состава.</p>':''),
  cancel+'<button class="btn primary" data-action="confirm-import" '+((!data.entries.length&&!previous||!targets.length&&!addCategory)?'disabled':'')+'>'+label+'</button>');
}

function updateLeagueRoster(day,data,category){
 const source=data.selection;
 const eventKey=value=>value.slice(0,value.lastIndexOf('/'));
 if(day.entries.some(entry=>entry.leagueSource&&eventKey(entry.leagueSource)!==eventKey(source))){
  throw Error('В этот игровой день уже загружены заявки другого тура или уровня лиги.');
 }
 const nameKey=player=>C.normalizeName(C.playerFullName(player).normalize());
 const lineup=entry=>JSON.stringify(entry.players.map(nameKey).sort());
 const previous=day.entries.filter(entry=>entry.leagueSource===source);
 const oldRows=new Map(previous.map(entry=>[lineup(entry),entry]));
 const oldRatings=new Map(previous.flatMap(entry=>entry.players.map(player=>[nameKey(player),player.rating])));
 const manual=new Set(day.entries.filter(entry=>!entry.leagueSource&&entry.category===category).map(lineup));
 const imported=data.entries.filter(entry=>!manual.has(lineup(entry))).map(entry=>({
  id:oldRows.get(lineup(entry))?.id??crypto.randomUUID(),category,leagueSource:source,
  players:entry.players.map(player=>({...player,rating:player.rating??oldRatings.get(nameKey(player))??null}))
 }));
 const replacements=new Map(imported.map(entry=>[entry.id,entry]));
 const oldIds=new Set(previous.map(entry=>entry.id));
 day.entries=day.entries.flatMap(entry=>{
  if(!oldIds.has(entry.id))return [entry];
  const updated=replacements.get(entry.id);
  return updated?[updated]:[];
 });
 day.entries.push(...imported.filter(entry=>!oldIds.has(entry.id)));
 Object.assign(day.settings,{date:data.date,venue:data.venue,level:data.levelLabel});
}

function confirmRosterImport(){
 const data=importPreview;
 if(!data)return;
 let category=$('#import-target').value;
 const saved=mutate(day=>{
  if(day.started)throw Error('Турнир уже начался.');
  if(data.selection&&category==='new'&&day.categories.length<5){
   const division=T.divisions.find(item=>item.code===data.code);
   category=crypto.randomUUID();
   day.categories.push({...division,id:category,division:division.id});
  }else if(!importTargets(data).some(item=>item.id===category))throw Error('Выберите подходящую категорию.');
  if(data.selection)updateLeagueRoster(day,data,category);
  else day.entries.push(...data.entries.map(entry=>({id:crypto.randomUUID(),category,players:entry.players})));
 },'Состав сохранён.');
 if(saved){$('#dialog').close();view='participants';rosterCategory=category;rosterSelected.clear();swapSelection=null;query='';
  location.hash='participants';render();importPreview=null;}
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');if(!target)return;
 const action=target.dataset.action,id=target.dataset.id;
 if(boardMode&&!['backup','fetch-category','fetch-import'].includes(action))return;
 switch(action){
 case 'retry-scheduling':scheduleReadyMatches(true);break;
 case 'editor':acquireEditor();break;
 case 'next-round':realDrawDialog(id);break;
 case 'offer-redraw':offerRedraw(id);break;
 case 'redraw':if(mutate(s=>T.redraw(s,id),'Тур пересчитан.'))$('#dialog').close();break;
 case 'backup':backup();break;
 case 'send-league-results':sendLeagueResults();break;
 case 'new-day':dialog('Создать новый день?','Текущий день будет заменён','<p>Сначала сохраните резервную копию или CSV результатов. Демонстрационные сценарии хранятся отдельно.</p>','<button class="btn" data-action="backup">Скачать копию</button>'+cancel+'<button class="btn primary" data-action="confirm-new-day">Создать новый день</button>');break;
 case 'confirm-new-day':if(persist(T.newDay())){$('#dialog').close();view='tournament';filter='all';query='';lookupQuery='';rosterCategory='';rosterSelected.clear();location.hash='tournament';render();}break;
 case 'close-day':{
  if(!state.categories.every(c=>T.roundStatus(state,c.id).complete)){toast('Сначала завершите все встречи.');return;}
  const tied=state.categories.filter(c=>T.standings(state,c.id).some(r=>r.tied));
  dialog('Зафиксировать результаты?','Результаты сохранятся',tied.length?'<p>В разрядах '+tied.map(c=>c.code).join(', ')+' есть разделённые места. Они сохранятся в итогах.</p>':'<p>Все встречи завершены. Итоговые места и CSV доступны в таблицах.</p>',cancel+'<button class="btn primary" data-action="confirm-close-day">Завершить</button>');break;
 }
 case 'confirm-close-day':if(state.categories.every(c=>T.roundStatus(state,c.id).complete)&&persist({...state,closed:true})){$('#dialog').close();render();}break;
 case 'reopen-day':if(persist({...state,closed:false}))render();break;
 case 'recover':if(editorReady&&recoveryState){try{state=D.recover(localStorage,recoveryState);storageError='';recoveryState=null;render();toast('Предыдущая запись восстановлена.');}catch(error){toast(error.message);}}break;
 case 'restore-backup':if(backupPreview){try{if(!editorReady)throw Error('Откройте вкладку организатора.');if(storageError)state=D.recover(localStorage,backupPreview);else if(!persist(backupPreview))break;storageError='';recoveryState=null;backupPreview=null;$('#dialog').close();render();toast('День восстановлен.');}catch(error){toast(error.message);}}break;
 case 'import-league':
 case 'fetch-league-catalog':leagueImportDialog();break;
 case 'fetch-league-roster':fetchImport({source:'league',selection:$('#league-selection').value});break;
 case 'fetch-import':fetchImport({url:$('#import-url').value.trim()});break;
 case 'fetch-category':fetchImport({url:target.dataset.url});break;
 case 'confirm-import':confirmRosterImport();break;
 }
});
document.addEventListener('change',async event=>{
 if(event.target.id!=='restore-file'||!event.target.files?.[0])return;
 try{const file=event.target.files[0];if(file.size>10*1024*1024)throw Error('Файл больше 10 МБ.');backupPreview=D.decode(await file.text());
  dialog('Восстановить игровой день?',esc(backupPreview.settings.title),'<p>'+esc(backupPreview.settings.date)+' · '+backupPreview.entries.length+' участников / пар · '+backupPreview.matches.filter(m=>m.status==='done').length+' результатов.</p><p>Этот файл заменит текущий день на устройстве.</p>','<button class="btn" data-action="backup">Скачать текущий день</button>'+cancel+'<button class="btn primary" data-action="restore-backup">Восстановить</button>');
 }catch(error){backupPreview=null;toast('Файл не принят: '+error.message);}
});
async function prepareOffline(){
 if(!('serviceWorker' in navigator)){offlineError='Этот браузер не поддерживает автономную установку.';return;}
 try{const registration=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;offlineReady=true;
  const badge=document.querySelector('.offline-status');if(badge)badge.textContent='● Офлайн готов';
  const explanation=document.querySelector('#offline-explanation');if(explanation)explanation.textContent='Приложение загружено для автономной работы. Можно отключить интернет.';
  if(registration.waiting)toast('Обновление готово. Оно установится после закрытия всех вкладок SwissCourt.');
 }catch{offlineError='Не удалось подготовить автономную работу. Проверьте интернет и HTTPS.';}
}
render();acquireEditor();prepareOffline();
