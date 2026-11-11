/* SwissCourt interface sketch. No external services or production pairing engine. */
'use strict';
const C=SwissCourtCore;
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
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'
};
const icon=(name,cls='')=>'<svg class="'+cls+'" aria-hidden="true" viewBox="0 0 24 24">'+(paths[name]||paths.court)+'</svg>';
const boardMode=location.hash==='#board';
const params=new URLSearchParams(location.search);
let mode=params.get('scenario')==='prep'?'prep':'live';
let state,storageError='',view=boardMode?'board':(location.hash.slice(1)||'dashboard'),filter='all',selectedCategory='xd',query='',scoreMatchId='',assignMatchId='';
const storageKey=()=> 'swisscourt-ui-v1-'+mode;
function loadState(){storageError='';try{const raw=localStorage.getItem(storageKey());if(raw){const parsed=JSON.parse(raw);if(parsed.version!==1||!Array.isArray(parsed.matches)||!Array.isArray(parsed.entries)||!parsed.settings||!Array.isArray(parsed.categories)||!Array.isArray(parsed.history))throw Error('Неверный формат');state=parsed;}else state=C.seed(mode);}catch(error){state=C.seed(mode);storageError='Не удалось прочитать сохранённый эскиз. Изменения не сохраняются; исходные данные в хранилище не заменены.';}}
loadState();
function persist(next){
 if(storageError){toast(storageError);return false;}
 try{localStorage.setItem(storageKey(),JSON.stringify(next));state=next;return true;}
 catch(error){toast('Не удалось сохранить изменение. Проверьте доступ к хранилищу браузера.');return false;}
}
function mutate(fn,message){const next=structuredClone(state);try{fn(next);}catch(error){toast(error.message);return false;}if(!persist(next))return false;render();if(message)toast(message);return true;}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4600);}
const entry=id=>state.entries.find(e=>e.id===id);
const cat=id=>state.categories.find(c=>c.id===id);
const surnames=id=>entry(id)?.players.map(p=>p.name.trim().split(/\s+/).at(-1)).join(' / ')||'—';
const fullNames=id=>entry(id)?.players.map(p=>esc(p.name)).join('<br>')||'—';
const pairNames=id=>entry(id)?.players.map(p=>esc(p.name.trim().split(/\s+/).at(-1))).join('<br>')||'—';
const badge=id=>'<span class="pill '+cat(id).color+'">'+esc(cat(id).short)+'</span>';
const time=value=>new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
const dateLabel=()=>new Date(state.settings.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
const freeCourts=()=>Array.from({length:state.settings.courts},(_,i)=>i+1).filter(c=>!state.matches.some(m=>m.status==='playing'&&m.court===c));
const doneMatches=()=>state.matches.filter(m=>m.status==='done');
const currentRound=id=>Math.max(1,...state.matches.filter(m=>m.category===id).map(m=>m.round));
const totalMatches=()=>state.categories.reduce((sum,c)=>{const n=state.entries.filter(e=>e.category===c.id).length;return sum+(n<7?n*(n-1)/2:Math.floor(n/2)*c.rounds);},0);
const scoreText=m=>m.scores.map(s=>s.join(':')).join(' · ');
function restLabel(m){const mins=C.restMinutes(state,m);return '<span class="rest '+(mins!==null&&mins<15?'short':'')+'">'+icon('clock')+(mins===null?'Первая игра':mins+' мин отдыха')+'</span>';}
function categoryFilters(active,action,all=true){return (all?'<button class="filter '+(active==='all'?'active':'')+'" data-action="'+action+'" data-id="all" aria-pressed="'+(active==='all')+'">Все разряды</button>':'')+state.categories.map(c=>'<button class="filter '+(active===c.id?'active':'')+'" data-action="'+action+'" data-id="'+c.id+'" aria-pressed="'+(active===c.id)+'">'+esc(c.short)+'</button>').join('');}
function nav(){
 const items=[['dashboard','grid','Игровой день'],['participants','people','Участники'],['standings','table','Таблицы'],['results','history','Результаты'],['settings','settings','Настройки']];
 return '<aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">'+icon('court')+'</span><div><div class="brand-name">SwissCourt</div><small>БАДМИНТОН · ТУРНИРЫ</small></div></a><div class="side-label">Рабочее пространство</div><nav class="nav" aria-label="Основная навигация">'+items.map(([id,ico,label])=>'<a href="#'+id+'" class="'+(view===id?'active':'')+'" '+(view===id?'aria-current="page"':'')+' title="'+label+'">'+icon(ico)+'<span class="nav-label">'+label+'</span>'+(id==='participants'?'<span class="count">'+state.entries.reduce((s,e)=>s+e.players.length,0)+'</span>':'')+'</a>').join('')+'</nav><div class="side-day"><div class="eyebrow muted">Сегодня в зале</div><p>'+esc(state.settings.title)+'</p><small>'+dateLabel()+' · '+state.settings.start+'–'+state.settings.end+'<br>'+state.categories.length+' разряда · '+state.settings.courts+' корта</small></div><div class="side-bottom"><div class="demo-box"><div class="eyebrow">Интерактивный эскиз</div><select id="scenario" aria-label="Сценарий прототипа"><option value="live" '+(mode==='live'?'selected':'')+'>Турнир идёт</option><option value="prep" '+(mode==='prep'?'selected':'')+'>Подготовка дня</option></select><p>Демонстрационные участники.<br>Можно пробовать и менять.</p></div><div class="side-footer"><span>ПРОТОТИП 0.1</span><button class="icon-btn" data-action="about" aria-label="О прототипе">'+icon('info')+'</button></div></div></aside>';
}
function topbar(){return '<header class="topbar"><div class="breadcrumbs"><span>Рабочее пространство</span><span>/</span><strong>'+dateLabel()+' '+state.settings.date.slice(0,4)+'</strong></div><a href="#dashboard" class="mobile-brand"><span class="brand-mark">'+icon('court')+'</span>SwissCourt</a><div class="top-actions"><div class="save-status" title="'+(storageError?'Хранилище недоступно':'Изменения сохраняются в этом браузере')+'">'+icon(storageError?'info':'shield')+'<span>'+(storageError?'Ошибка хранения':'Хранится на устройстве')+'</span></div><button class="btn small" data-action="board">'+icon('monitor')+'Открыть табло'+icon('arrow')+'</button><div class="avatar" title="Организатор">ОР</div></div></header>';}
function heading(title,subtitle,actions=''){return '<div class="page-heading"><div><div class="title-overline">'+esc(state.settings.title)+'<span class="pill">ДЕМО</span></div><h1>'+title+'</h1><p>'+subtitle+'</p></div>'+actions+'</div>';}
function footer(){return '<footer class="page-footer"><span>'+icon('shield')+'Изменения эскиза сохраняются в этом браузере</span><span>SwissCourt · Предварительный интерфейс <button class="icon-btn" data-action="about" aria-label="Возможности прототипа">'+icon('info')+'</button></span></footer>';}
function summary(){const occupied=state.matches.filter(m=>m.status==='playing').length;return '<div class="day-summary"><div class="summary-venue"><div class="venue-icon">'+icon('location')+'</div><div class="stack"><strong>'+esc(state.settings.venue)+'</strong><small>'+dateLabel()+' · '+state.settings.start+'–'+state.settings.end+' · '+esc(state.settings.level)+'</small></div></div><div class="summary-stat"><strong>'+occupied+' <span>/ '+state.settings.courts+'</span></strong><small>кортов занято</small></div><div class="summary-stat"><strong>'+C.queue(state).length+'</strong><small>встреч в очереди</small></div><div class="summary-stat"><strong>'+doneMatches().length+' <span>/ '+totalMatches()+'</span></strong><small>встреч сыграно</small></div></div>';}
function courtCard(number){
 const m=state.matches.find(m=>m.status==='playing'&&m.court===number);
 if(!m)return '<article class="court free"><div class="court-top"><strong>'+icon('court')+'Корт '+number+'</strong><span class="court-status"><i class="dot"></i>Свободен</span></div><div class="free-content">'+icon('court','court-art')+'<strong>Готов к новой игре</strong><p>Выберите следующую встречу из очереди</p><button class="btn small soft" data-action="choose-match" data-court="'+number+'">'+icon('plus')+'Назначить встречу</button></div></article>';
 const elapsed=Math.max(0,Math.floor((Date.now()-m.startedAt)/60000));
 return '<article class="court"><div class="court-top"><strong>'+icon('court')+'Корт '+number+'</strong><span class="court-status"><i class="dot"></i>Идёт игра</span></div><div class="court-content"><div class="court-meta">'+badge(m.category)+'<small>Тур '+m.round+'</small></div><div class="court-team">'+pairNames(m.a)+'</div><div class="court-versus">против</div><div class="court-team">'+pairNames(m.b)+'</div></div><div class="court-footer"><span class="court-timer" title="Начало в '+time(m.startedAt)+'">'+icon('clock')+elapsed+' мин · '+time(m.startedAt)+'</span><button class="btn small" data-action="score" data-id="'+m.id+'">Внести счёт'+icon('arrow')+'</button></div></article>';
}
function queueRow(m,index,compact=false){
 const available=freeCourts().length>0;
 return '<div class="queue-row"><span class="queue-number">'+String(index+1).padStart(2,'0')+'</span><div class="queue-match"><div class="match-category">'+badge(m.category)+'<span>Тур '+m.round+'</span>'+(m.pinned?'<span>· Приготовиться</span>':'')+'</div><div class="match-teams"><span>'+esc(surnames(m.a))+'</span><span class="vs">vs</span><span>'+esc(surnames(m.b))+'</span></div></div>'+restLabel(m)+'<div class="queue-actions">'+(!compact?'<button class="icon-btn '+(m.pinned?'selected':'')+'" data-action="pin" data-id="'+m.id+'" aria-label="'+(m.pinned?'Убрать отметку':'Приготовиться')+': '+esc(surnames(m.a))+'" aria-pressed="'+m.pinned+'" title="Показать первыми в блоке «Приготовиться»">'+icon('pin')+'</button>':'')+'<button class="btn small '+(index===0?'soft':'')+'" data-action="assign" data-id="'+m.id+'" '+(!available?'disabled title="Все корты заняты"':'')+'>Вызвать</button></div></div>';
}
function divisionCard(c){
 const matches=state.matches.filter(m=>m.category===c.id),done=matches.filter(m=>m.status==='done').length,n=state.entries.filter(e=>e.category===c.id).length,total=n<7?n*(n-1)/2:Math.floor(n/2)*c.rounds;
 return '<div class="division-card"><div class="spread"><strong>'+esc(c.short)+'</strong><span class="pill '+c.color+'">'+c.code+'</span></div><p>'+n+' '+(c.doubles?'пар':'участниц')+' · '+(n<7?'Круговая система':'Швейцарская система')+'</p><div class="progress" role="progressbar" aria-label="Сыграно встреч: '+esc(c.short)+'" aria-valuenow="'+done+'" aria-valuemin="0" aria-valuemax="'+total+'"><span style="width:'+(total?done/total*100:0)+'%"></span></div><div class="progress-caption"><span>Тур '+currentRound(c.id)+' из '+(n<7?n-1:c.rounds)+'</span><span>'+done+' / '+total+' игр</span></div></div>';
}
function dashboard(){
 if(!state.started)return preparation();
 const queued=C.queue(state).filter(m=>filter==='all'||m.category===filter);
 return heading('Проведение турнира','Весь игровой день — под контролем.', '<a class="btn" href="#settings">'+icon('settings')+'Параметры дня</a>')+summary()+'<section aria-label="Корты"><div class="section-heading"><h2>Корты <span class="count">'+state.settings.courts+'</span></h2><span class="sub">'+(freeCourts().length?freeCourts().length+' свободен'+(freeCourts().length===1?'':'о'):'Все корты заняты')+' · обновляется автоматически</span></div><div class="courts-grid">'+Array.from({length:state.settings.courts},(_,i)=>courtCard(i+1)).join('')+'</div></section><div class="lower-grid"><section class="panel" id="queue"><div class="panel-heading"><div><h2>Очередь встреч <span class="count">'+C.queue(state).length+'</span></h2><p>Выберите встречу и вызовите участников на корт</p></div></div><div class="filter-row">'+categoryFilters(filter,'filter')+'</div><div class="queue-legend"><span>Рекомендуемый порядок</span><span>Отдых · Действия</span></div>'+(queued.length?queued.map((m,i)=>queueRow(m,i)).join(''):'<div class="empty">'+icon('check')+'<strong>Очередь пуста</strong>Завершите текущие встречи, чтобы перейти к следующему туру.</div>')+'<div class="panel-footer">'+icon('info')+'Отдых менее 15 минут снижает рекомендацию. Решение о вызове — за вами.</div></section><aside class="aside-stack"><section class="panel"><div class="panel-heading"><h2>Ход турниров</h2>'+icon('table')+'</div>'+state.categories.map(divisionCard).join('')+'</section><div class="mini-note">'+icon('pin')+'<div><strong>Дайте время приготовиться</strong><p>Отметьте встречу значком булавки — она появится первой на табло для игроков.</p></div></div><section class="panel"><div class="panel-heading"><h2>Последние результаты</h2></div>'+doneMatches().slice().sort((a,b)=>b.endedAt-a.endedAt).slice(0,3).map(m=>'<button class="recent-item" style="width:100%;background:white;text-align:left" data-action="score" data-id="'+m.id+'"><strong>'+esc(surnames(m.a))+'<br>'+esc(surnames(m.b))+'</strong><span>'+C.validateScores(m.scores).wins.join(':')+'</span></button>').join('')+'<a class="panel-footer" href="#results">Все результаты'+icon('arrow')+'</a></section></aside></div>';
}
function preparation(){return heading('Подготовка игрового дня','Проверьте составы и параметры перед первым вызовом.')+'<div class="prep-intro"><div><div class="eyebrow" style="color:#b6cc98;margin-bottom:12px">Всё начинается с хорошей подготовки</div><h2>Ваш следующий игровой день</h2><p>'+dateLabel()+' · '+esc(state.settings.venue)+'<br>'+state.entries.length+' участников и пар · '+state.categories.length+' разряда · '+state.settings.courts+' корта</p></div><button class="btn" data-action="draw">Первый тур'+icon('arrow')+'</button></div><div class="prep-grid"><section class="panel prep-card"><div class="prep-icon">'+icon('settings')+'</div><span class="eyebrow muted">Шаг 01</span><h2>Зал и время</h2><p>Дата, аренда и общие корты для всех разрядов.</p><a class="btn" href="#settings">Настроить день'+icon('arrow')+'</a></section><section class="panel prep-card"><div class="prep-icon">'+icon('people')+'</div><span class="eyebrow muted">Шаг 02</span><h2>Составы и рейтинги</h2><p>Добавьте участников вручную или проверьте демо-состав.</p><a class="btn" href="#participants">Открыть участников'+icon('arrow')+'</a></section><section class="panel prep-card"><div class="prep-icon">'+icon('court')+'</div><span class="eyebrow muted">Шаг 03</span><h2>Жеребьёвка</h2><p>Посмотрите пары первого тура перед публикацией.</p><button class="btn" data-action="draw">Посмотреть пары'+icon('arrow')+'</button></section></div><div class="notice">'+icon('info')+'Это отдельный сценарий подготовки. Изменения здесь не затрагивают демонстрационный турнир, который уже идёт.</div>';}
function participants(){
 const entries=state.entries.filter(e=>(filter==='all'||e.category===filter)&&e.players.some(p=>p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 return heading('Участники','Составы разрядов и индивидуальные рейтинги.',state.started?'<span class="pill">'+icon('shield')+'Составы зафиксированы</span>':'<button class="btn primary" data-action="edit-entry">'+icon('plus')+'Добавить участника</button>')+(state.started?'<div class="notice">'+icon('info')+'Турнир уже идёт, составы доступны для просмотра. Чтобы попробовать добавление и редактирование, выберите сценарий «Подготовка дня» в настройках.</div>':'')+'<div class="tabs">'+categoryFilters(filter,'filter')+'</div><section class="panel"><div class="table-toolbar"><div class="search">'+icon('search')+'<input class="form-control" id="participant-search" type="search" placeholder="Найти по имени или фамилии" aria-label="Поиск участников" value="'+esc(query)+'"></div><span class="muted" style="font-size:11px">Показано: '+entries.length+'</span>'+(!state.started?'<button class="btn small" data-action="import">'+icon('link')+'Из BadminTune</button>':'')+'</div><div class="table-wrap"><table><thead><tr><th>№</th><th>Участник / пара</th><th>Разряд</th><th class="numeric">Рейтинг</th><th>Действия</th></tr></thead><tbody>'+entries.map((e,i)=>'<tr><td class="muted">'+String(i+1).padStart(2,'0')+'</td><td class="team-cell"><strong>'+e.players.map(p=>esc(p.name)).join('<br>')+'</strong><small>'+e.players.map(p=>p.rating).join(' + ')+(e.players.length===2?' · среднее пары':' · рейтинг СБР')+'</small></td><td>'+badge(e.category)+'</td><td class="numeric"><strong>'+C.rating(e).toLocaleString('ru-RU')+'</strong></td><td><button class="icon-btn" data-action="edit-entry" data-id="'+e.id+'" aria-label="'+(state.started?'Посмотреть':'Редактировать')+' '+esc(surnames(e.id))+'">'+icon(state.started?'info':'edit')+'</button>'+(!state.started?'<button class="icon-btn" data-action="remove-entry" data-id="'+e.id+'" aria-label="Удалить '+esc(surnames(e.id))+'">'+icon('trash')+'</button>':'')+'</td></tr>').join('')+'</tbody></table>'+(entries.length?'':'<div class="empty">Никого не найдено. Попробуйте другую фамилию.</div>')+'</div></section>';
}
function standingsTable(id,board=false){
 const rows=C.standings(state,id),swiss=rows.length>=7;
 return '<div class="table-wrap"><table><thead><tr><th>Место*</th><th>Участник / пара</th><th class="numeric">И</th><th class="numeric">В</th><th class="numeric">П</th><th class="numeric">Очки</th>'+(!board&&swiss?'<th class="numeric" title="Бухгольц">Бухг.</th><th class="numeric" title="Бергер">Берг.</th>':'')+(!board?'<th class="numeric">Партии</th>':'')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+(board?r.place:'<span class="place '+(r.place===1?'top':'')+'">'+r.place+'</span>')+'</td><td class="team-cell"><strong>'+fullNames(r.entry.id)+'</strong></td><td class="numeric">'+r.played+'</td><td class="numeric">'+r.wins+'</td><td class="numeric">'+r.losses+'</td><td class="numeric"><strong>'+r.points+'</strong></td>'+(!board&&swiss?'<td class="numeric">'+r.buchholz+'</td><td class="numeric">'+r.berger+'</td>':'')+(!board?'<td class="numeric">'+r.setsFor+':'+r.setsAgainst+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';
}
function standings(){return heading('Турнирные таблицы','Текущее положение по завершённым встречам.','<button class="btn" data-action="export">'+icon('download')+'Скачать CSV</button>')+'<div class="tabs">'+categoryFilters(selectedCategory,'category',false)+'</div><section class="panel"><div class="panel-heading"><div><h2>'+esc(cat(selectedCategory).name)+'</h2><p>'+state.entries.filter(e=>e.category===selectedCategory).length+' участников / пар · Тур '+currentRound(selectedCategory)+'</p></div>'+badge(selectedCategory)+'</div>'+standingsTable(selectedCategory)+'</section><div class="notice" style="margin-top:20px">'+icon('info')+'* В эскизе место определяется по очкам; при равенстве место разделяется. Дополнительные показатели показаны справочно. Итоговая методика разрешения равенств ещё не утверждена.</div>';}
function results(){const list=doneMatches().filter(m=>filter==='all'||m.category===filter).sort((a,b)=>b.endedAt-a.endedAt);return heading('Результаты встреч','Сохранённые протоколы и история исправлений.','<button class="btn" data-action="history">'+icon('history')+'История изменений <span class="count">'+state.history.length+'</span></button>')+'<div class="tabs">'+categoryFilters(filter,'filter')+'</div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Встреча</th><th>Тур</th><th>Счёт партий</th><th>Итог</th><th>Время</th><th></th></tr></thead><tbody>'+list.map(m=>'<tr><td class="team-cell"><strong>'+esc(surnames(m.a))+'</strong><small>против '+esc(surnames(m.b))+'</small><div style="margin-top:8px">'+badge(m.category)+'</div></td><td>'+m.round+'</td><td style="white-space:nowrap">'+scoreText(m)+'</td><td><strong>'+C.validateScores(m.scores).wins.join(':')+'</strong></td><td>'+time(m.endedAt)+'</td><td><button class="btn small" data-action="score" data-id="'+m.id+'">'+icon('edit')+'Исправить</button></td></tr>').join('')+'</tbody></table>'+(list.length?'':'<div class="empty">Результатов пока нет. Здесь появятся завершённые встречи.</div>')+'</div></section>';}
function settings(){
 const s=state.settings;
 return heading('Настройки игрового дня','Зал, разряды и параметры табло.')+'<div class="settings-grid"><form class="panel form-panel" id="settings-form"><h2>Параметры дня</h2><p>Все разряды используют общие корты.</p><div class="form-grid"><div class="field full"><label for="day-title">Название</label><input id="day-title" class="form-control" name="title" value="'+esc(s.title)+'" maxlength="80" required></div><div class="field full"><label for="venue">Зал</label><input id="venue" class="form-control" name="venue" value="'+esc(s.venue)+'" maxlength="100" required></div><div class="field"><label for="day-date">Дата</label><input id="day-date" class="form-control" name="date" type="date" value="'+s.date+'" required></div><div class="field"><label for="level">Дивизион</label><input id="level" class="form-control" name="level" value="'+esc(s.level)+'" maxlength="60" required></div><div class="field"><label for="start">Начало аренды</label><input id="start" class="form-control" name="start" type="time" value="'+s.start+'" required></div><div class="field"><label for="end">Окончание аренды</label><input id="end" class="form-control" name="end" type="time" value="'+s.end+'" required></div><div class="field"><label for="courts">Количество кортов</label><input id="courts" class="form-control" name="courts" type="number" min="1" max="8" value="'+s.courts+'" '+(state.started?'disabled':'')+' required>'+ (state.started?'<small>Зафиксировано после запуска</small>':'')+'</div><div class="field"><label for="prepare-count">Встреч на табло «Приготовиться»</label><select id="prepare-count" class="form-control" name="prepareCount">'+[4,5,6,7].map(n=>'<option '+(s.prepareCount===n?'selected':'')+'>'+n+'</option>').join('')+'</select></div></div><div id="settings-error" class="error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">'+icon('check')+'Сохранить параметры</button></div></form><div class="aside-stack" style="display:flex"><section class="panel form-panel"><h2>Разряды</h2><p>До 6 участников — круговая система, от 7 — швейцарская.</p>'+state.categories.map(c=>{const n=state.entries.filter(e=>e.category===c.id).length;return '<div class="config-row"><div><strong>'+esc(c.short)+'</strong><small>'+n+' '+(c.doubles?'пар':'участниц')+' · '+(n<7?'Круговая':'Швейцарская')+'</small></div>'+(n>=7?'<select class="form-control rounds-select" data-category="'+c.id+'" aria-label="Туров: '+esc(c.short)+'" '+(state.started?'disabled':'')+'><option value="4" '+(c.rounds===4?'selected':'')+'>4 тура</option><option value="5" '+(c.rounds===5?'selected':'')+'>5 туров</option></select>':'<span class="pill">'+(n-1)+' туров</span>')+'</div>';}).join('')+'</section><section class="panel form-panel"><h2>Сценарии эскиза</h2><p>Можно изучить подготовку или продолжить демонстрационный игровой день.</p><div class="field"><label for="settings-scenario">Сценарий</label><select id="settings-scenario" class="form-control"><option value="live" '+(mode==='live'?'selected':'')+'>Турнир идёт</option><option value="prep" '+(mode==='prep'?'selected':'')+'>Подготовка дня</option></select></div><button class="btn ghost danger small" style="margin-top:17px" data-action="reset">'+icon('refresh')+'Сбросить этот сценарий</button></section><div class="mini-note">'+icon('shield')+'<div><strong>Данные остаются здесь</strong><p>Эскиз сохраняет изменения в текущем браузере. Очистка данных сайта удалит их. Импорт и автономная установка PWA пока не подключены.</p></div></div></div></div>';
}
function board(){
 const queue=C.queue(state),pinned=queue.filter(m=>m.pinned),upNext=[...pinned,...queue.filter(m=>!m.pinned)].slice(0,state.settings.prepareCount);
 return '<div class="board"><header class="board-header"><div class="brand" style="padding:0"><span class="brand-mark">'+icon('court')+'</span><div><div class="brand-name">SwissCourt</div><small style="color:#8faa7a">ТАБЛО ДЛЯ ИГРОКОВ · ДЕМО</small></div></div><span class="board-title">'+esc(state.settings.title)+' · '+dateLabel()+'</span><div class="row"><time class="board-clock">'+time(Date.now())+'</time><button class="icon-btn" data-action="fullscreen" aria-label="На весь экран">'+icon('expand')+'</button></div></header><h2 class="board-heading">Сейчас на кортах</h2><div class="board-courts">'+Array.from({length:state.settings.courts},(_,i)=>{const m=state.matches.find(m=>m.status==='playing'&&m.court===i+1);return '<div class="board-court"><div class="number">КОРТ '+(i+1)+'</div>'+(m?'<div class="teams">'+pairNames(m.a)+'<small>ПРОТИВ</small>'+pairNames(m.b)+'</div>'+badge(m.category):'<div class="teams" style="color:#729563">Свободен</div><div class="pill">Ожидает вызова</div>')+'</div>';}).join('')+'</div><div class="board-bottom"><section><h2 class="board-heading">Приготовиться</h2><div class="board-queue">'+upNext.map((m,i)=>'<div class="board-queue-item"><span>'+String(i+1).padStart(2,'0')+'</span><div><small>'+esc(cat(m.category).name)+' · Тур '+m.round+'</small>'+esc(surnames(m.a))+' <span style="color:#7f9b6e">/</span> '+esc(surnames(m.b))+'</div></div>').join('')+(upNext.length?'':'<div class="empty">Ожидайте объявления следующего тура</div>')+'</div></section><section><h2 class="board-heading">Турнирная таблица</h2><div class="tabs">'+categoryFilters(selectedCategory,'category',false)+'</div>'+standingsTable(selectedCategory,true)+'<p style="font-size:11px;color:#90a57d;margin-top:14px">* При равных очках место разделяется. Предварительная таблица.</p></section></div></div>';
}
function render(){
 if(boardMode){$('#app').innerHTML=board();return;}
 if(!['dashboard','participants','standings','results','settings'].includes(view))view='dashboard';
 const screens={dashboard,participants,standings,results,settings};
 $('#app').innerHTML=nav()+'<div class="main-shell">'+topbar()+'<main class="content">'+(storageError?'<div class="notice warn" role="alert">'+icon('info')+esc(storageError)+'</div>':'')+screens[view]()+footer()+'</main></div>';
}
function dialog(title,subtitle,body,actions=''){
 const d=$('#dialog');if(d.open)d.close();d.innerHTML='<div class="dialog-header"><div><h2 id="dialog-title">'+title+'</h2><p>'+subtitle+'</p></div><button class="icon-btn" data-action="close" aria-label="Закрыть">'+icon('close')+'</button></div><div class="dialog-body">'+body+'</div>'+(actions?'<div class="dialog-actions">'+actions+'</div>':'');d.showModal();
}
const cancel='<button class="btn" data-action="close">Отмена</button>';
function scoreDialog(id){
 const m=state.matches.find(m=>m.id===id);if(!m)return;scoreMatchId=id;
 const correction=m.status==='done',values=correction?m.scores:[];
 const body='<div class="row">'+badge(m.category)+'<span class="muted" style="font-size:11px">Тур '+m.round+(correction?'':' · Корт '+m.court)+'</span></div><div class="score-head"><span></span><span>1 партия</span><span>2 партия</span><span>3 партия</span></div>'+[m.a,m.b].map((id,side)=>'<div class="score-team"><strong>'+fullNames(id)+'</strong>'+[0,1,2].map(i=>'<input class="score-input" id="score-'+i+'-'+side+'" type="number" inputmode="numeric" min="0" max="30" step="1" aria-label="'+esc(surnames(id))+' — партия '+(i+1)+'" placeholder="—" value="'+(values[i]?.[side]??'')+'">').join('')+'</div>').join('')+'<div class="score-summary" id="score-summary">До двух выигранных партий. Третья нужна только при счёте 1:1.</div><div class="error" id="score-error" role="alert"></div>'+(correction?'<p class="muted" style="font-size:11px;margin-top:16px;line-height:1.7">Исправление попадёт в историю. Назначенные соперники следующих туров сохранятся.</p>':'');
 dialog(correction?'Исправить результат':'Результат встречи',correction?'Проверьте счёт по бумажному протоколу':'После сохранения корт освободится',body,(correction?'':'<button class="btn ghost danger" style="margin-right:auto" data-action="return-queue" data-id="'+m.id+'">Вернуть в очередь</button>')+'<button class="btn primary" data-action="save-score">'+icon('check')+'Сохранить результат</button>');
 updateScore();setTimeout(()=>$('#score-0-0')?.focus(),40);
}
function rawScores(){return [0,1,2].map(i=>[0,1].map(side=>$('#score-'+i+'-'+side).value));}
function updateScore(){
 const raw=rawScores();const firstTwo=raw.slice(0,2),canDecide=firstTwo.every(s=>s.every(x=>x!=='')&&C.validGame(Number(s[0]),Number(s[1])));
 const straight=canDecide&&(Number(raw[0][0])>Number(raw[0][1]))===(Number(raw[1][0])>Number(raw[1][1]));
 [0,1].forEach(side=>{const input=$('#score-2-'+side);input.disabled=straight;if(straight)input.value='';});
 const result=C.validateScores(rawScores());const m=state.matches.find(m=>m.id===scoreMatchId);
 $('#score-summary').textContent=result.ok?'Победа: '+surnames(result.winner===0?m.a:m.b)+' · '+result.wins.join(':'):(straight?'Третья партия не требуется.':'До двух выигранных партий. Третья нужна только при счёте 1:1.');
 $('#score-error').textContent='';
}
let preferredCourt=null;
function assignDialog(id,court){
 const m=state.matches.find(m=>m.id===id),free=freeCourts();if(!m||!free.length){toast('Все корты заняты. Сначала внесите результат.');return;}assignMatchId=id;const mins=C.restMinutes(state,m);
 dialog('Вызвать на корт',cat(m.category).name+' · Тур '+m.round,'<div class="match-preview"><strong>'+fullNames(m.a)+'</strong><span>ПРОТИВ</span><strong>'+fullNames(m.b)+'</strong></div><div class="court-options">'+free.map((n,i)=>'<label class="court-option"><input type="radio" name="court" value="'+n+'" '+(n===Number(court)||(!free.includes(Number(court))&&i===0)?'checked':'')+'>Корт '+n+'</label>').join('')+'</div>'+(mins!==null&&mins<15?'<div class="notice warn" style="margin-bottom:0">'+icon('clock')+'Минимальный отдых — '+mins+' мин. Рекомендуется 15 минут; вы можете запустить встречу сейчас.</div>':'<p>После назначения объявите участников и номер корта в микрофон.</p>'),cancel+'<button class="btn primary" data-action="start-match">'+icon('court')+'Назначить и вызвать</button>');
}
function editEntryDialog(id){
 const e=id?entry(id):{id:null,category:filter==='all'?'xd':filter,players:[{name:'',rating:''},{name:'',rating:''}]},locked=state.started;
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
 if(mutate(s=>{if(s.started)throw Error('Состав уже зафиксирован.');if(id)s.entries.find(e=>e.id===id).players=players;else s.entries.push({id:'entry-'+crypto.randomUUID(),category,players});},'Участник сохранён'))$('#dialog').close();
}
let draft=[];
function drawDialog(){
 if(state.started){toast('Первый тур уже опубликован.');return;}draft=[];
 const unsupported=state.categories.find(c=>{const n=state.entries.filter(e=>e.category===c.id).length;return n<2||n%2===1;});
 if(unsupported){dialog('Проверка состава','Первый тур','<p>В разряде «'+esc(unsupported.name)+'» '+state.entries.filter(e=>e.category===unsupported.id).length+' участников / пар.</p><div class="notice warn" style="margin-top:15px">'+icon('info')+'В этом эскизе можно опробовать жеребьёвку на чётном составе от двух участников. Сценарий bye будет добавлен при реализации спортивного алгоритма.</div>','<button class="btn" data-action="close">Вернуться к составам</button>');return;}
 for(const c of state.categories)C.firstPairs(state.entries.filter(e=>e.category===c.id)).forEach(([a,b],i)=>draft.push({id:'round1-'+c.id+'-'+i,category:c.id,a,b,round:1,status:'queued',pinned:false}));
 dialog('Первый тур','Предварительный просмотр пар',draft.map(m=>'<div class="history-entry"><span class="pill '+cat(m.category).color+'">'+esc(cat(m.category).short)+'</span><div style="margin-top:6px">'+esc(surnames(m.a))+' — '+esc(surnames(m.b))+'</div></div>').join('')+'<p style="margin-top:17px;font-size:11px">После публикации составы фиксируются, встречи появляются в очереди. Для оценки в сценарии подготовки доступен первый тур.</p>',cancel+'<button class="btn primary" data-action="publish-draw">Опубликовать и начать'+icon('arrow')+'</button>');
}
function exportCsv(){
 const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';
 const rows=C.standings(state,selectedCategory);
 const lines=[['Игрок 1','Игрок 2','Место','Игры','Победы','Поражения'],...rows.map(r=>[r.entry.players[0].name,r.entry.players[1]?.name||'',r.place,r.played,r.wins,r.losses])];
 const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SwissCourt-DEMO-'+selectedCategory+'-'+state.settings.date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV сохранён. В эскизе равные очки дают разделённые места.');
}
function switchScenario(value){mode=value==='prep'?'prep':'live';loadState();filter='all';query='';view='dashboard';history.replaceState(null,'','?scenario='+mode+'#dashboard');render();toast(mode==='prep'?'Открыт отдельный сценарий подготовки':'Открыт сценарий идущего турнира');}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');if(!target)return;
 const action=target.dataset.action,id=target.dataset.id;
 switch(action){
 case 'close':$('#dialog').close();break;
 case 'filter':filter=id;render();break;
 case 'category':selectedCategory=id;render();break;
 case 'score':scoreDialog(id);break;
 case 'save-score':{
  const result=C.validateScores(rawScores());if(!result.ok){$('#score-error').textContent=result.error;return;}
  const m=state.matches.find(m=>m.id===scoreMatchId),oldCourt=m.court,correcting=m.status==='done';
  if(mutate(s=>C.finish(s,scoreMatchId,result.scores),correcting?'Результат исправлен. Изменение записано в историю.':'Результат сохранён. Корт '+oldCourt+' свободен.'))$('#dialog').close();break;
 }
 case 'return-queue':dialog('Вернуть встречу в очередь?','Корт освободится без результата','<p>Соперники останутся прежними. Введённый, но не сохранённый счёт будет очищен.</p>',cancel+'<button class="btn primary" data-action="confirm-return" data-id="'+id+'">Вернуть в очередь</button>');break;
 case 'confirm-return':if(mutate(s=>C.returnToQueue(s,id),'Встреча возвращена в очередь, корт свободен.'))$('#dialog').close();break;
 case 'pin':mutate(s=>{const m=s.matches.find(m=>m.id===id);if(m.status!=='queued')throw Error('Встреча уже вызвана.');if(!m.pinned&&s.matches.filter(m=>m.status==='queued'&&m.pinned).length>=s.settings.prepareCount)throw Error('На табло уже отмечено '+s.settings.prepareCount+' встреч. Уберите одну отметку.');m.pinned=!m.pinned;},'Блок «Приготовиться» обновлён');break;
 case 'assign':assignDialog(id,preferredCourt);preferredCourt=null;break;
 case 'choose-match':{
  preferredCourt=Number(target.dataset.court);const list=C.queue(state);dialog('Встреча на корт '+preferredCourt,'Выберите участников из очереди',list.length?list.map((m,i)=>queueRow(m,i,true)).join(''):'<p>В очереди пока нет доступных встреч.</p>');break;
 }
 case 'start-match':{const court=Number($('input[name="court"]:checked')?.value);if(mutate(s=>C.assign(s,assignMatchId,court),'Встреча назначена на корт '+court+'. Объявите участников.'))$('#dialog').close();break;}
 case 'edit-entry':editEntryDialog(id);break;
 case 'save-entry':saveEntry();break;
 case 'remove-entry':dialog('Удалить участника?','Из состава этого игрового дня','<p>'+fullNames(id)+'</p>',cancel+'<button class="btn danger" data-action="confirm-remove" data-id="'+id+'">Удалить из состава</button>');break;
 case 'confirm-remove':if(mutate(s=>{if(s.started)throw Error('Состав уже зафиксирован.');s.entries=s.entries.filter(e=>e.id!==id);},'Участник удалён из состава'))$('#dialog').close();break;
 case 'draw':drawDialog();break;
 case 'publish-draw':if(mutate(s=>{if(s.started)throw Error('Тур уже опубликован.');s.matches=structuredClone(draft);s.started=true;},'Первый тур опубликован. Можно вызывать участников.')){$('#dialog').close();location.hash='dashboard';}break;
 case 'export':exportCsv();break;
 case 'board':{
  if(!storageError){try{localStorage.setItem(storageKey(),JSON.stringify(state));}catch(error){toast('Не удалось передать состояние табло. Хранилище недоступно.');return;}}
  const url=new URL(location.href);url.search='?scenario='+mode;url.hash='board';const tab=window.open(url.href,'swisscourt-board-'+mode);if(!tab)toast('Разрешите открытие новой вкладки для табло.');break;
 }
 case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen().catch(()=>toast('Не удалось выйти из полноэкранного режима'));else document.documentElement.requestFullscreen().catch(()=>toast('Полноэкранный режим недоступен в этом браузере'));break;
 case 'import':dialog('Импорт из BadminTune','Предварительный вид шага импорта','<div class="field"><label for="import-url">Ссылка на турнир или разряд</label><input class="form-control" id="import-url" type="url" placeholder="https://msk.volan.web-us.ru/…"></div><div class="notice" style="margin-top:18px">'+icon('info')+'Импорт в этом эскизе не подключён. Можно добавить участников вручную или использовать демонстрационный состав. Данные по ссылке не отправляются.</div>','<button class="btn" data-action="close">Понятно</button>');break;
 case 'history':dialog('История исправлений','Исходный и изменённый счёт',state.history.length?state.history.map(h=>{const m=state.matches.find(m=>m.id===h.matchId);return '<div class="history-entry"><strong>'+esc(surnames(m.a))+' — '+esc(surnames(m.b))+'</strong><small>'+time(h.at)+' · '+h.old.map(s=>s.join(':')).join(', ')+' → '+h.new.map(s=>s.join(':')).join(', ')+'</small></div>';}).join(''):'<p>Исправлений пока нет. Они появятся здесь после изменения сохранённого результата.</p>','<button class="btn" data-action="close">Закрыть</button>');break;
 case 'reset':dialog('Начать сценарий заново?','Только текущий демонстрационный сценарий','<p>Внесённые в этот сценарий результаты, участники и параметры будут заменены исходным демо-набором. Второй сценарий сохранится.</p>',cancel+'<button class="btn danger" data-action="confirm-reset">Сбросить демо-данные</button>');break;
 case 'confirm-reset':if(persist(C.seed(mode))){$('#dialog').close();view='dashboard';location.hash='dashboard';render();toast('Демонстрационный сценарий восстановлен.');}break;
 case 'about':dialog('Интерфейс для обсуждения','SwissCourt · Эскиз 0.1','<p>Можно назначать встречи, вводить и исправлять результаты, отмечать «Приготовиться», смотреть табло и выгружать CSV. В сценарии подготовки доступны ручной состав, параметры и первый тур.</p><div class="notice" style="margin-top:18px">'+icon('info')+'Это предварительный прототип. Полная швейцарская жеребьёвка, bye, финальные тай-брейки, импорт BadminTune и установка PWA ещё не реализованы.</div><p style="font-size:11px">Данные тестовые; изменения остаются в этом браузере. Для реального турнира прототип пока не предназначен.</p>','<button class="btn primary" data-action="close">Продолжить знакомство</button>');break;
 }
});
document.addEventListener('input',event=>{
 if(event.target.classList.contains('score-input'))updateScore();
 if(event.target.id==='participant-search'){
  const pos=event.target.selectionStart;query=event.target.value;render();const input=$('#participant-search');input.focus();if(input.type!=='search'||pos!==null)try{input.setSelectionRange(pos,pos);}catch{}
 }
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
 if(!Number.isInteger(values.courts)||values.courts<1||values.courts>8){$('#settings-error').textContent='Укажите от 1 до 8 кортов.';return;}
 for(const key of ['title','venue','level']){values[key]=values[key].trim();if(!values[key]){$('#settings-error').textContent='Заполните название, зал и дивизион.';return;}}
 mutate(s=>{Object.assign(s.settings,values);},'Параметры игрового дня сохранены');
});
window.addEventListener('hashchange',()=>{if(boardMode)return;view=location.hash.slice(1)||'dashboard';filter='all';query='';render();window.scrollTo(0,0);});
window.addEventListener('storage',event=>{if(event.key===storageKey()){loadState();if($('#dialog').open){$('#dialog').close();toast('Данные изменились в другой вкладке. Откройте встречу заново.');}render();}});
setInterval(()=>{if(!$('#dialog').open&&(view==='dashboard'||boardMode))render();},30000);
render();
