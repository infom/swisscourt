'use strict';

let rosterCategory='',swapSelection=null;
const rosterSelected=new Set();
function activeRosterCategory(){
 return state.categories.find(category=>category.id===rosterCategory)||
  state.categories.find(category=>category.id===selectedCategory)||state.categories[0];
}
function selectedRosterEntries(category){
 return state.entries.filter(entry=>entry.category===category&&rosterSelected.has(entry.id));
}
function rosterTabs(active){
 return '<div class="tabs roster-tabs" aria-label="Категории">'+state.categories.map(category=>{
  const count=state.entries.filter(entry=>entry.category===category.id).length;
  const ready=!state.started&&T.preparedOrder(state,category.id);
  return '<button class="filter '+(category.id===active?'active':'')+'" data-action="roster-category" data-id="'+category.id+'" aria-pressed="'+(category.id===active)+'">'+
   badge(category.id)+'<span>'+count+(category.planned?'/'+category.planned:'')+'</span>'+
   (ready?'<small class="roster-ready">Готова</small>':'')+'</button>';
 }).join('')+'</div>';
}
function rosterRow(participant,index,seed,editable){
 return '<tr>'+(editable?'<td><input type="checkbox" data-roster-select="'+participant.id+'" aria-label="Выбрать '+esc(surnames(participant.id))+'" '+(rosterSelected.has(participant.id)?'checked':'')+'></td>':'')+
  '<td class="numeric">'+(index+1)+'</td><td class="team-cell"><strong>'+participant.players.map(player=>esc(C.playerFullName(player))).join('<br>')+'</strong>'+
  '<small>'+participant.players.map(player=>player.rating??'—').join(' / ')+'</small></td><td class="numeric"><strong>'+C.rating(participant).toLocaleString('ru-RU')+'</strong></td>'+
  '<td class="numeric">'+(seed?'<span class="seed-number">'+esc(seed)+'</span>':'—')+'</td><td><button class="icon-btn" data-action="edit-entry" data-id="'+participant.id+
  '" aria-label="'+(editable?'Редактировать':'Посмотреть')+' '+esc(surnames(participant.id))+'">'+icon(editable?'edit':'info')+'</button></td></tr>';
}
function drawSeat(id,category,label,editable){
 if(!id)return '<div class="draw-seat draw-placeholder">'+esc(label||'Пропуск')+'</div>';
 const contents='<small>'+esc(label)+'</small><strong>'+esc(surnames(id))+'</strong>';
 if(!editable)return '<div class="draw-seat">'+contents+'</div>';
 const selected=swapSelection?.category===category&&swapSelection.id===id;
 return '<button class="draw-seat '+(selected?'marked':'')+'" draggable="true" data-action="swap-draw-seat" data-draw-entry="'+id+'" data-draw-category="'+category+
  '" aria-pressed="'+selected+'" aria-label="'+esc(label+' · '+surnames(id))+'">'+contents+'</button>';
}
function rosterDraw(category,order,editable){
 if(!order)return '<div class="empty">Жеребьёвка ещё не проведена.</div>';
 const id=category.id,scheme=T.schemeOf(state,id);
 if(scheme==='groups'){
  const layout=B.layout(category,order);
  return '<div class="draw-groups">'+layout.groups.map((group,index)=>'<section><h3>Группа '+B.groupNumber(index)+'</h3>'+
   group.map((participant,i)=>drawSeat(participant,id,'Место '+(i+1),editable)).join('')+'</section>').join('')+'</div>';
 }
 if(scheme==='knockout'){
  const {brackets}=B.layout(category,order);
  const context={brackets,nodes:brackets[0].nodes,matches:new Map(),resolve:ref=>ref.entry};
  return bracketTree(context,true,(participant,label)=>drawSeat(participant,id,participant?String(order.indexOf(participant)+1):label,editable));
 }
 return '<div class="draw-order">'+order.map((participant,index)=>drawSeat(participant,id,String(index+1),editable)).join('')+'</div>';
}
function roster(){
 const category=activeRosterCategory(),id=category.id;
 const roster=state.entries.filter(entry=>entry.category===id);
 const needle=C.normalizeName(query);
 const visible=roster.filter(entry=>entry.players.some(player=>[C.playerFullName(player),player.name].some(name=>C.normalizeName(name).includes(needle))));
 const editable=editorReady&&!state.started,labels=T.seedLabels(state,id);
 const order=state.started?state.drawOrders?.[id]||T.drawOrder(state,id):T.preparedOrder(state,id);
 return heading('Участники','Состав, посев и жеребьёвка по категориям.')+rosterTabs(id)+
  '<div class="roster-workspace"><section class="panel roster-list"><div class="roster-toolbar">'+(editable?
   '<button class="btn primary" data-action="edit-entry">'+icon('plus')+'Добавить</button>'+
   '<button class="btn" id="delete-roster" data-action="delete-roster" '+(!selectedRosterEntries(id).length?'disabled':'')+'>Удалить</button>'+
   '<button class="btn" data-action="import-league">'+icon('link')+'Из Лиги 8Я</button>'+
   '<button class="btn" data-action="import">'+icon('link')+'Из Бадминтюна</button>':'')+
   '<label class="search">'+icon('search')+'<input class="form-control" id="participant-search" type="search" placeholder="Фамилия или имя" aria-label="Поиск участников" value="'+esc(query)+'"></label>'+
   '<span class="muted">Показано: '+visible.length+'</span></div>'+
   '<div class="table-wrap"><table><thead><tr>'+(editable?'<th aria-label="Выбор строки"></th>':'')+
   '<th>№</th><th>'+(category.doubles?'Пара':'Участник')+'</th><th class="numeric">Рейтинг</th><th class="numeric">Посев</th><th></th></tr></thead><tbody>'+
   visible.map((participant,i)=>rosterRow(participant,i,labels.get(participant.id),editable)).join('')+'</tbody></table>'+
   (!visible.length?'<div class="empty">'+(roster.length?'Совпадений нет.':'Состав пока пуст.')+'</div>':'')+'</div></section>'+
  '<div class="roster-draw-column"><section class="panel roster-controls"><h2>Посев и жеребьёвка</h2><span class="roster-state '+(order?'ready':'')+'">'+(order?'Жеребьёвка готова':'Жеребьёвка ожидается')+'</span>'+
   (editable?'<div class="roster-actions"><button class="btn" data-action="choose-seed">Посев</button>'+
    (labels.size?'<button class="btn" data-action="clear-seed">Очистить посев</button>':'')+
    '<button class="btn primary" data-action="prepare-draw" '+(roster.length<2?'disabled':'')+'>Жеребьёвка</button>'+
    (order?'<button class="btn danger" data-action="clear-draw">Удалить жеребьёвку</button>':'')+'</div>':'')+'</section>'+
  (order?'<section class="panel draw-preview roster-draw"><div class="panel-heading"><strong>Жеребьёвка · '+esc(categoryLabel(category))+'</strong>'+
   (editable?'<small>Перетащите участника или выберите два места для обмена.</small>':'')+'</div>'+rosterDraw(category,order,editable)+'</section>':'')+'</div></div>';
}
function showSeedOptions(){
 const category=activeRosterCategory(),current=state.seedPlans?.[category.id];
 dialog('Посев',esc(categoryLabel(category)),'<div class="seed-options">'+Object.entries(T.seedModes).map(([id,label])=>
  '<button class="btn '+(current===id?'primary':'')+'" data-action="apply-seed" data-id="'+id+'">'+label+'</button>'
 ).join('')+'</div>',cancel);
}
function exchangeRosterSeats(category,a,b){
 if(a===b)return;
 swapSelection=null;
 mutate(next=>T.swapDraw(next,category,a,b),'Места поменяны');
}
document.addEventListener('change',event=>{
 const id=event.target.dataset?.rosterSelect;
 if(!id||state.started)return;
 if(event.target.checked)rosterSelected.add(id);else rosterSelected.delete(id);
 $('#delete-roster').disabled=!selectedRosterEntries(activeRosterCategory().id).length;
});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');
 if(!target||boardMode||mode!=='real')return;
 const {action,id,drawEntry,drawCategory}=target.dataset;
 const category=activeRosterCategory();
 if(action==='roster-category'){rosterCategory=id;rosterSelected.clear();swapSelection=null;query='';render();return;}
 if(state.started||!editorReady)return;
 switch(action){
 case 'choose-seed':showSeedOptions();break;
 case 'apply-seed':if(mutate(s=>T.setSeedMode(s,category.id,id),'Посев задан'))$('#dialog').close();break;
 case 'clear-seed':mutate(s=>T.setSeedMode(s,category.id,''),'Посев очищен');break;
 case 'prepare-draw':swapSelection=null;mutate(s=>T.prepareDraw(s,category.id),'Жеребьёвка сохранена');break;
 case 'clear-draw':swapSelection=null;mutate(s=>T.clearDraw(s,category.id),'Жеребьёвка удалена');break;
 case 'swap-draw-seat':
  if(swapSelection?.category===drawCategory&&swapSelection.id!==drawEntry){exchangeRosterSeats(drawCategory,swapSelection.id,drawEntry);break;}
  swapSelection=swapSelection?.id===drawEntry?null:{category:drawCategory,id:drawEntry};render();break;
 case 'delete-roster':{
  const selected=selectedRosterEntries(category.id);
  if(selected.length)dialog('Удалить из состава?',esc(categoryLabel(category)),'<p>'+selected.map(row=>fullNames(row.id)).join('<br>')+'</p>',
   cancel+'<button class="btn danger" data-action="confirm-delete-roster">Удалить</button>');
  break;
 }
 case 'confirm-delete-roster':{
  const ids=new Set(selectedRosterEntries(category.id).map(row=>row.id));
  if(ids.size&&mutate(s=>{s.entries=s.entries.filter(row=>!ids.has(row.id));},'Состав обновлён')){rosterSelected.clear();$('#dialog').close();}
  break;
 }
 }
});
let draggedSeat=null;
document.addEventListener('dragstart',event=>{
 const seat=event.target.closest('[data-draw-entry]');
 if(!seat||state.started||!editorReady)return;
 draggedSeat={id:seat.dataset.drawEntry,category:seat.dataset.drawCategory};
 event.dataTransfer.setData('text/plain',draggedSeat.id);
 event.dataTransfer.effectAllowed='move';
});
document.addEventListener('dragover',event=>{
 const seat=event.target.closest('[data-draw-entry]');
 if(seat&&draggedSeat?.category===seat.dataset.drawCategory){event.preventDefault();event.dataTransfer.dropEffect='move';}
});
document.addEventListener('drop',event=>{
 const seat=event.target.closest('[data-draw-entry]');
 if(!seat||state.started||draggedSeat?.category!==seat.dataset.drawCategory)return;
 event.preventDefault();
 exchangeRosterSeats(draggedSeat.category,draggedSeat.id,seat.dataset.drawEntry);
 draggedSeat=null;
});
document.addEventListener('dragend',()=>{draggedSeat=null;});
