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
 if(state.closed)return '<div class="app-notice">День завершён. Результаты доступны в таблицах и CSV.</div>';
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
 const complete=state.categories.every(c=>T.roundStatus(state,c.id).complete);
 return '<div class="round-controls">'+state.categories.map(c=>{
  const r=T.roundStatus(state,c.id),swiss=T.schemeOf(state,c.id)==='swiss';
  return '<div>'+badge(c.id)+'<span>'+(r.complete?'Все встречи завершены':esc(stageSummary(c.id)))+(r.partial?' · встречи тура '+r.round+' добавляются досрочно':'')+'</span>'+(r.canDraw?'<button class="btn primary small" data-action="next-round" data-id="'+c.id+'">Сформировать тур '+(r.round+1)+'</button>':'')+(!state.closed&&swiss&&!r.partial&&r.round>1&&state.matches.filter(m=>m.category===c.id&&m.round===r.round).every(m=>m.status==='queued')?'<button class="btn small" data-action="offer-redraw" data-id="'+c.id+'">Пересчитать тур</button>':'')+'</div>';
 }).join('')+(scheduleError?'<button class="btn small" data-action="retry-scheduling">Повторить расчёт очереди</button>':'')+(complete&&!state.closed?'<button class="btn primary" data-action="close-day">Зафиксировать результаты</button>':'')+'</div>';
}
function dayTools(){
 const real=mode==='real';
 return '<section class="panel form-panel"><h2>Игровой день</h2>'+(real?'<p>Изменения сохраняются автоматически на этом устройстве. Резервный файл позволяет перенести день или восстановить его после очистки браузера.</p><div class="day-actions"><button class="btn" data-action="backup">'+icon('download')+'Резервная копия</button><label class="btn">Восстановить из файла<input id="restore-file" type="file" accept=".json,application/json" hidden></label>'+(recoveryState?'<button class="btn" data-action="recover">Восстановить предыдущую запись</button>':'')+(state.closed?'<button class="btn" data-action="reopen-day">Открыть для исправления</button>':'')+'<button class="btn" data-action="new-day">Новый турнир</button>'+(!state.started?'<a class="btn" href="#plan">Выбрать разряды</a>':'')+'</div>':'<a class="btn primary" href="./">Мой турнир</a>')+'<p class="muted" style="margin-top:16px">Демо: <a href="?scenario=live">7 кортов</a> · <a href="?scenario=simulation#board">Симуляция</a></p></section><section class="panel form-panel"><h2>Без интернета</h2><p id="offline-explanation">'+(offlineReady?'Приложение загружено для автономной работы. Можно отключить интернет.':'Пока автономная загрузка не подтверждена. Откройте приложение с интернетом и дождитесь отметки «Офлайн готов».')+'</p><p>На телефоне: меню браузера → «Установить приложение» или «На экран Домой». На компьютере: значок установки в адресной строке.</p></section>';
}
function realDrawDialog(category){
 try{
  if(!state.started){
   const missing=state.categories.find(c=>c.seeding==='manual'&&state.entries.some(e=>e.category===c.id)&&(
    !c.manualOrder||c.manualOrder.length!==state.entries.filter(e=>e.category===c.id).length||c.manualOrder.some(id=>entry(id)?.category!==c.id)
   ));
   if(missing){openManualSeed(missing.id);return;}
   const next=structuredClone(state);
   T.start(next);
   realDraft={first:true,revision:state.revision,next};
   const preview=next.categories.map(c=>{
    const n=next.entries.filter(e=>e.category===c.id).length,scheme=T.schemeOf(next,c.id);
    const manual=c.seeding==='manual'?'<button class="btn small" data-action="manual-seed" data-id="'+c.id+'">Изменить посев</button>':'';
    const groups=scheme==='groups'?T.bracketContext(next,c.id).groups.map((ids,i)=>'<p><strong>Группа '+B.letter(i)+'</strong> · '+ids.map(id=>esc(surnames(id))).join(' · ')+'</p>').join(''):'';
    const matches=next.matches.filter(m=>m.category===c.id&&m.round===1);
    const mismatch=c.planned&&c.planned!==n?'<p class="notice warn">Планировалось '+c.planned+', фактически '+n+'. Расчёт по фактическому составу.</p>':'';
    return '<section class="draw-preview"><h3>'+esc(c.code+' · '+c.name)+'</h3><p>'+esc(B.schemes[scheme])+' · '+C.formatOf(next,c.id).label+' · '+T.totalMatches(next,c.id)+' встреч</p>'+
     mismatch+manual+groups+matches.map(m=>'<div class="history-entry">'+matchup(m)+'</div>').join('')+byeDraft(next.byes.filter(b=>b.category===c.id&&b.round===1))+'</section>';
   }).join('');
   const forecast=P.estimate(next,{actual:true,now:Date.parse(next.settings.date+'T'+next.settings.start)});
   dialog('Жеребьёвка и посев','Проверьте составы и первые встречи',timingStatus(forecast)+preview,
    cancel+'<button class="btn primary" data-action="publish-draw">Опубликовать и начать</button>');
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
 if(realDraft.first?persist(realDraft.next):mutate(s=>T.publish(s,realDraft.proposal),'Тур опубликован. Можно вызывать встречи.')){$('#dialog').close();view='dashboard';location.hash='dashboard';realDraft=null;render();}
}
function offerRedraw(category){
 dialog('Пересчитать следующий тур?',cat(category).code,'<p>Новый счёт учитывается в таблице. Следующий тур ещё не начался: можно пересчитать пары по обновлённым очкам. При отказе опубликованные соперники сохранятся.</p>',cancel+'<button class="btn primary" data-action="redraw" data-id="'+category+'">Пересчитать</button>');
}
function downloadFile(name,content,type){
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function backup(){downloadFile('SwissCourt-'+state.settings.date+'.json',JSON.stringify(state,null,2),'application/json');}
function divisionDialog(){
 dialog('Разряды игрового дня','От одной до пяти одновременно',T.divisions.map(c=>'<label class="division-choice"><input type="checkbox" name="day-division" value="'+c.id+'" '+(state.categories.some(x=>x.id===c.id)?'checked':'')+'> '+c.code+' · '+c.name+'</label>').join('')+'<p>Разряд с участниками сначала нужно освободить. Остальные составы сохраняются.</p>',cancel+'<button class="btn primary" data-action="save-divisions">Сохранить</button>');
}
function importDialog(){
 if(state.started){toast('Импорт доступен до начала турнира.');return;}
 importPreview=null;
 dialog('Импорт из BadminTune','Сначала предпросмотр, затем добавление','<div class="field"><label for="import-url">Ссылка на турнир или разряд</label><input class="form-control" id="import-url" type="url" placeholder="https://msk.volan.web-us.ru/tournament/…"></div><p>Импортируются основные заявки выбранного разряда. Резерв и неполные пары пропускаются; недостающие рейтинги нужно заполнить вручную.</p><div id="import-status" role="status"></div>',cancel+'<button class="btn primary" data-action="fetch-import">Загрузить</button>');
}
async function fetchImport(url){
 const requestId=++importRequest;
 const status=$('#import-status');status.textContent='Загрузка…';
 try{
  const response=await fetch('./api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Источник недоступен.');
  if(!$('#dialog').open||!$('#import-status')||requestId!==importRequest)return;
  if(data.categories){
   dialog('Выберите разряд BadminTune',data.name||'Турнир',data.categories.map(c=>'<button class="btn import-category" data-action="fetch-category" data-url="'+esc(c.url)+'">'+esc(c.name)+'</button>').join('')+'<div id="import-status" role="status"></div>',cancel);return;
  }
  importPreview=data;
  dialog('Проверьте импорт',data.name+' · '+data.entries.length+' участников / пар',
   '<div class="field"><label for="import-target">Добавить в разряд</label><select id="import-target" class="form-control">'+state.categories.filter(c=>c.code===data.code).map(c=>'<option value="'+c.id+'">'+esc(c.code+' · '+c.name)+'</option>').join('')+'</select></div>'+(!state.categories.some(c=>c.code===data.code)?'<p class="notice warn">Сначала добавьте разряд '+esc(data.code)+' в настройках.</p>':'')+
   (data.warnings||[]).map(w=>'<p class="notice warn">'+esc(w)+'</p>').join('')+'<div class="import-list">'+data.entries.map(e=>'<p>'+e.players.map(p=>esc(C.playerFullName(p))+' · '+(p.rating===null?'рейтинг не указан':p.rating)).join(' / ')+'</p>').join('')+'</div><p>Индивидуальные рейтинги получены из BadminTune. Проверьте их перед стартом; каждый состав можно отредактировать после импорта.</p>',cancel+'<button class="btn primary" data-action="confirm-import" '+(!data.entries.length||!state.categories.some(c=>c.code===data.code)?'disabled':'')+'>Добавить в состав</button>');
 }catch(error){if($('#dialog').open&&$('#import-status')&&requestId===importRequest)$('#import-status').textContent='Не удалось импортировать: '+error.message+' Состав не изменён.';}
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
 case 'new-day':dialog('Создать новый день?','Текущий день будет заменён','<p>Сначала сохраните резервную копию или CSV результатов. Демонстрационные сценарии хранятся отдельно.</p>','<button class="btn" data-action="backup">Скачать копию</button>'+cancel+'<button class="btn primary" data-action="confirm-new-day">Создать новый день</button>');break;
 case 'confirm-new-day':if(persist(T.newDay())){$('#dialog').close();view='plan';filter='all';query='';lookupQuery='';location.hash='plan';render();}break;
 case 'divisions':divisionDialog();break;
 case 'save-divisions':{
  const codes=[...document.querySelectorAll('input[name="day-division"]:checked')].map(el=>el.value);
  if(mutate(s=>{if(s.started)throw Error('Состав уже зафиксирован.');if(s.entries.some(e=>!codes.includes(e.category)))throw Error('Сначала удалите участников исключаемого разряда.');s.categories=codes.map(code=>s.categories.find(c=>c.id===code)||structuredClone(T.divisions.find(c=>c.id===code)));},'Разряды сохранены.'))$('#dialog').close();break;
 }
 case 'close-day':{
  if(!state.categories.every(c=>T.roundStatus(state,c.id).complete)){toast('Сначала завершите все встречи.');return;}
  const tied=state.categories.filter(c=>T.standings(state,c.id).some(r=>r.tied));
  dialog('Зафиксировать результаты?','Результаты сохранятся',tied.length?'<p>В разрядах '+tied.map(c=>c.code).join(', ')+' есть разделённые места. Они сохранятся в итогах.</p>':'<p>Все встречи завершены. Итоговые места и CSV доступны в таблицах.</p>',cancel+'<button class="btn primary" data-action="confirm-close-day">Завершить</button>');break;
 }
 case 'confirm-close-day':if(state.categories.every(c=>T.roundStatus(state,c.id).complete)&&persist({...state,closed:true})){$('#dialog').close();render();}break;
 case 'reopen-day':if(persist({...state,closed:false}))render();break;
 case 'recover':if(editorReady&&recoveryState){try{state=D.recover(localStorage,recoveryState);storageError='';recoveryState=null;render();toast('Предыдущая запись восстановлена.');}catch(error){toast(error.message);}}break;
 case 'restore-backup':if(backupPreview){try{if(!editorReady)throw Error('Откройте вкладку организатора.');if(storageError)state=D.recover(localStorage,backupPreview);else if(!persist(backupPreview))break;storageError='';recoveryState=null;backupPreview=null;$('#dialog').close();render();toast('День восстановлен.');}catch(error){toast(error.message);}}break;
 case 'fetch-import':fetchImport($('#import-url').value.trim());break;
 case 'fetch-category':fetchImport(target.dataset.url);break;
 case 'confirm-import':if(importPreview){const category=$('#import-target').value;if(mutate(s=>{if(s.started)throw Error('Турнир уже начался.');const imported=importPreview.entries.map(e=>({id:crypto.randomUUID(),category,players:e.players}));s.entries.push(...imported);},'Участники добавлены. Проверьте рейтинги перед первым туром.')){$('#dialog').close();view='participants';location.hash='participants';render();importPreview=null;}}break;
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
