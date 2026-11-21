'use strict';
const B=SwissCourtBrackets,P=SwissCourtPlanning;
let planDraft=null;
const planField=(label,element)=>'<label class="field"><span>'+label+'</span>'+element+'</label>';
const planOptions=(values,selected)=>Object.entries(values).map(([value,label])=>
 '<option value="'+esc(value)+'" '+(String(selected)===value?'selected':'')+'>'+esc(label)+'</option>').join('');
const minutesText=minutes=>{const total=Math.ceil(Math.abs(minutes));return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');};
function rentalInput(minutes,attributes){
 const value=Number.isSafeInteger(minutes)?minutesText(minutes):'';
 return '<input class="form-control" type="text" '+attributes+' value="'+value+'" placeholder="2:30" required>';
}
function timingStatus(estimate,showLive=false){
 if(estimate.invalid)return '<div class="plan-state warn">Проверьте настройки категорий</div>';
 const fits=estimate.reserve>=0;
 const elapsed=showLive&&estimate.elapsed!==null?'<span>Прошло '+minutesText(Math.floor(estimate.elapsed))+
  (estimate.done<estimate.count?' · До конца ≈ '+minutesText(estimate.remaining):'')+'</span>':'';
 return '<div class="plan-state '+(fits?'fits':'overrun')+'"><strong>'+(fits?'Укладываемся в аренду':'Выходим за время аренды')+'</strong><span>'+
  (fits?'Запас ':'Превышение ')+minutesText(estimate.reserve)+'</span>'+elapsed+'</div>';
}
function initialRoutes(category){
 const places=Math.min(4,Math.max(...B.groupSizes(category.planned,category.groupCount)));
 if(category.routes)return category.routes.slice(0,places);
 if(!category.playoffs.length)return Array.from({length:places},(_,i)=>i===0?1:0);
 return Array.from({length:places},(_,i)=>{
  const placements=B.groupSizes(category.planned,category.groupCount).flatMap((size,group)=>size>i?[
   1+category.playoffs.findIndex(b=>b.slots?.some(slot=>slot.group===group&&slot.place===i+1))
  ]:[]);
  return new Set(placements).size>1?-1:placements[0]||0;
 });
}
function defaultPlan(category,n){
 const division=T.divisions.find(c=>c.id===(category.division||category.id));
 const plan={...structuredClone(category),name:category.name===division?.name?category.code:category.name,
  planned:category.planned||Math.max(2,n||8),scheme:category.scheme||(n>=2&&n<7?'circle':'swiss'),
  scoreFormat:category.scoreFormat||'classic',circles:category.circles||1,
  bracketMode:category.bracketMode||'single',groupCount:category.groupCount||2,playoffs:category.playoffs||[]};
 if(plan.scheme==='groups'){
  plan.routes=initialRoutes(plan);
  plan.playoffs=plan.playoffs.map(b=>({mode:b.mode}));
  normalizeGroupPlan(plan);
 }
 return plan;
}
function ensurePlanDraft(){
 if(planDraft?.id===state.id&&planDraft.revision===state.revision)return;
 const {start,end,...settings}=state.settings;
 planDraft={id:state.id,revision:state.revision,settings:{...settings,rentalMinutes:T.rentalDuration(state.settings),restMinutes:C.restInterval(state.settings)},
  categories:state.started?structuredClone(state.categories):state.categories.map(c=>defaultPlan(c,state.entries.filter(e=>e.category===c.id).length))};
}
function peekPlan(){
 const settings={...planDraft.settings};
 if(!C.validRestInterval(settings.restMinutes))settings.restMinutes=C.restInterval(state.settings);
 return P.estimate({...state,settings,categories:planDraft.categories},{actual:state.started,now:gameNow()});
}
function groupCounts(n){
 return [1,2,3,4].filter(count=>B.groupSizes(n,count).every(size=>size>=2&&size<=4));
}
function normalizeGroupPlan(category){
 const valid=groupCounts(category.planned);
 if(valid.length&&!valid.includes(category.groupCount))category.groupCount=valid[0];
 if(!category.playoffs.length)category.playoffs=[{mode:'single'}];
 const places=Math.min(4,Math.max(...B.groupSizes(category.planned,category.groupCount)));
 category.routes=Array.from({length:places},(_,i)=>category.routes?.[i]??(i===0?1:0));
}
function planPresetOptions(category){
 if([6,7].includes(category.planned))return [['places','Финалы за 1-е, 3-е и 5-е'],['semis','Два из группы в полуфиналы']];
 if(category.planned===12)return [['triple','Три сетки с бронзой']];
 return [];
}
function planSettingError(settings){
 if(!Number.isInteger(settings.courts)||settings.courts<1||settings.courts>32||!Number.isSafeInteger(settings.rentalMinutes)||settings.rentalMinutes<=0){
  return 'Укажите число кортов и длительность аренды, например 2:30.';
 }
 return C.validRestInterval(settings.restMinutes)?'':'Укажите отдых целым числом минут от нуля.';
}
function summaryCells(estimate){
 const error=planSettingError(planDraft.settings);
 const stats=estimate.invalid||error?['—','—','—']:[estimate.count,minutesText(estimate.court),minutesText(estimate.duration)];
 const status=error?'<div class="plan-state warn">'+error+'</div>':timingStatus(estimate,state.started);
 return '<div class="plan-summary-state">'+status+'</div>'+stats.map((value,i)=>
  '<div class="plan-stat total"><strong>'+value+'</strong><small>'+['Игр всего','Время на кортах','Время в зале'][i]+'</small></div>').join('');
}
function categoryCells(metric){
 const values=metric.error?['—','—','—']:[metric.count,minutesText(metric.court),minutesText(metric.span)];
 return values.map((value,i)=>'<div class="plan-stat" aria-label="'+['Игр','Время на кортах','Время в зале'][i]+'">'+value+'</div>').join('');
}
function planRadio(index,field,values,current,prefix,disabled=()=>false){
 return '<div class="plan-radios" role="group" aria-label="'+esc(prefix)+'">'+values.map(value=>
  '<label><input type="radio" name="plan-'+field+'-'+index+'" data-index="'+index+'" data-plan="'+field+'" value="'+value+'" '+
   (current===value?'checked ':'')+(disabled(value)?'disabled ':'')+'><span>'+value+'</span></label>').join('')+'</div>';
}
function groupFields(c,index){
 const groupChoices=groupCounts(c.planned),sizes=B.groupSizes(c.planned,c.groupCount);
 const routes=c.routes||[];
 const presets=planPresetOptions(c);
 const modes=c.playoffs.map((bracket,i)=>'<div class="plan-bracket-mode"><span>Сетка '+(i+1)+'</span>'+
  planSelect(index,'bracket-'+i,B.modes,bracket.mode,{label:'Тип сетки '+(i+1)})+'</div>').join('');
 const destinations=[...c.playoffs.map((_,i)=>[i+1,'Сетка '+(i+1)]),[0,'Вылет']];
 return '<div class="plan-group-layout"><div class="plan-group-options">'+
  (presets.length?planSelect(index,'preset',{'':'Шаблоны',...Object.fromEntries(presets)},'',{label:'Шаблоны'}):'')+
  '<div class="plan-count-choice"><span>Групп</span>'+planRadio(index,'groupCount',[1,2,3,4],c.groupCount,'Число групп',value=>!groupChoices.includes(value))+'</div>'+
  '<small class="group-size">Состав '+sizes.join(' + ')+'</small>'+
  '<div class="plan-playoffs"><div class="plan-count-choice"><span>Сеток</span>'+planRadio(index,'playoffCount',[1,2,3,4],c.playoffs.length,'Число сеток')+'</div>'+modes+'</div></div>'+
  '<table class="route-matrix" aria-label="Распределение мест"><thead><tr><th>Место</th>'+destinations.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+
  routes.map((route,i)=>'<tr><th scope="row">'+(i+1)+'-е</th>'+destinations.map(([value,label])=>'<td><label class="route-cell"><input type="radio" name="route-'+index+'-'+i+
   '" data-plan="route-'+i+'" data-index="'+index+'" value="'+value+'" aria-label="'+(i+1)+'-е место · '+label+'" '+(route===value?'checked':'')+'><span aria-hidden="true">'+icon('check')+'</span></label></td>').join('')+'</tr>').join('')+
  '</tbody></table></div>';
}
function planSelect(index,field,values,value,{disabled=false,leading='',compact='',label}={}){
 const labels={division:'Разряд',scoreFormat:'Формат счёта',scheme:'Схема',bracketMode:'Вариант олимпийки'};
 return '<span class="plan-select'+(leading?' has-icon':'')+(compact?' has-short-value':'')+'"><select class="form-control" aria-label="'+esc(label||labels[field])+
  '" data-plan="'+field+'" data-index="'+index+'" '+(disabled?'disabled':'')+'>'+planOptions(values,value)+'</select>'+
  (leading?icon(leading,'plan-select-icon'):'')+(compact?'<span class="plan-short-value" aria-hidden="true">'+esc(compact)+'</span>':'')+'</span>';
}
function schemeSettings(category,index,scheme,locked){
 if(locked){
  if(scheme==='circle')return (category.circles||1)+' круг.';
  if(scheme==='swiss')return category.rounds+' туров';
  if(scheme==='knockout')return B.modes[category.bracketMode];
  return category.groupCount+' групп · '+category.playoffs.length+' сеток';
 }
 if(scheme==='circle')return planRadio(index,'circles',[1,2],category.circles,'Число кругов')+'<small>круга</small>';
 if(scheme==='swiss')return planRadio(index,'rounds',[3,4,5,6,7],category.rounds,'Число туров',round=>round>B.circleRounds(category.planned))+'<small>туров</small>';
 if(scheme==='knockout')return planSelect(index,'bracketMode',B.modes,category.bracketMode);
 return groupFields(category,index);
}
function planRow(category,index,metric){
 const n=state.entries.filter(e=>e.category===category.id).length,locked=state.started||!editorReady;
 const scheme=category.scheme||T.schemeOf(state,category.id);
 const select=(field,values,value,options={})=>planSelect(index,field,values,value,{...options,disabled:options.disabled||locked});
 const input=(field,type,value,attrs='')=>'<input class="form-control" type="'+type+'" aria-label="'+({name:'Название категории',planned:'Участники по плану'}[field])+'" data-plan="'+field+'" data-index="'+index+
  '" value="'+esc(value)+'" '+attrs+' '+(locked?'disabled':'')+'>';
 const names=Object.fromEntries(T.divisions.map(c=>[c.id,c.code+' · '+c.name]));
 const label=category.doubles?'Пар':'Участников',schemeIcon={circle:'refresh',swiss:'table',knockout:'grid',groups:'people'};
 return '<div class="plan-grid plan-category-row"><div class="plan-name">'+input('name','text',category.name,'maxlength="5" placeholder="'+esc(category.code)+'"')+'</div>'+
  '<div>'+select('division',names,category.division||category.id,{disabled:n>0,compact:category.code})+'</div>'+
  '<div class="plan-number">'+input('planned','number',locked?n:category.planned,'min="2" max="32"')+(n&&!locked&&n!==category.planned?
   '<button class="btn small" data-action="actual-count" data-index="'+index+'" title="Взять фактический состав">'+n+' '+label.toLowerCase()+'</button>':'')+'</div>'+
  '<div>'+select('scoreFormat',Object.fromEntries(Object.entries(C.scoreFormats).map(([key,format])=>[key,format.label])),category.scoreFormat||'classic')+'</div>'+
  '<div>'+select('scheme',B.schemes,scheme,{leading:schemeIcon[scheme]})+'</div>'+
  '<div class="plan-scheme-options"><div class="plan-option-controls" id="plan-options-'+index+'">'+schemeSettings(category,index,scheme,locked)+'</div><p class="plan-metric-error" id="plan-error-'+index+'">'+esc(metric.error)+'</p></div>'+
  '<div class="plan-category-stats" id="plan-metric-'+index+'">'+categoryCells(metric)+'</div>'+
  '<div class="plan-remove">'+(!locked?'<button class="icon-btn" data-action="remove-plan-category" data-index="'+index+'" aria-label="Удалить категорию '+esc(categoryLabel(category))+'" '+(n||planDraft.categories.length===1?'disabled':'')+'>'+icon('trash')+'</button>':'')+'</div></div>';
}
function plannerActions(readonly){
 const menu='<details class="plan-menu"><summary class="btn">Ещё</summary><div class="plan-menu-panel">'+
  '<button class="btn" data-action="backup">'+icon('download')+'Резервная копия</button>'+
  (editorReady?'<label class="btn">Восстановить из файла<input id="restore-file" type="file" accept=".json,application/json" hidden></label>':'')+
  (editorReady&&recoveryState?'<button class="btn" data-action="recover">Восстановить предыдущую запись</button>':'')+
  (editorReady&&state.closed?'<button class="btn" data-action="reopen-day">Открыть для исправления</button>':'')+'</div></details>';
 return '<div class="plan-toolbar"><div class="plan-toolbar-management">'+
  (editorReady?'<button class="btn" data-action="new-day">Новый турнир</button>':'')+menu+'</div>'+
  (!readonly?'<div class="plan-toolbar-edit">'+(!state.started?'<button class="btn" data-action="add-plan-category" '+(planDraft.categories.length>=5?'disabled':'')+'>Добавить категорию</button>':'')+
   '<button class="btn primary" data-action="save-plan">Сохранить</button></div>':'')+'</div>';
}
function planner(){
 ensurePlanDraft();
 const draft=planDraft,estimate=peekPlan(),readonly=state.closed||!editorReady;
 const setting=(label,key,type,attributes='')=>planField(label,'<input class="form-control" type="'+type+'" data-plan-setting="'+key+'" value="'+esc(draft.settings[key])+'" '+attributes+' '+(readonly||state.started&&key==='courts'?'disabled':'')+'>');
 return heading('Турнир','',plannerActions(readonly))+
  '<section class="panel plan-card"><h2>Общие параметры</h2><div class="plan-config">'+setting('Название турнира','title','text','maxlength="100"')+
  setting('Дата','date','date')+setting('Зал','venue','text','maxlength="100"')+
  planField('Длительность аренды (ч:мм)',rentalInput(draft.settings.rentalMinutes,'id="plan-rental-minutes" data-plan-setting="rentalMinutes" '+(readonly?'disabled':'')))+
  setting('Кортов','courts','number','min="1" max="32"')+
  setting('Отдых между играми (мин)','restMinutes','number','id="plan-rest-minutes" min="0" step="1" required')+'</div></section>'+
  '<section class="panel plan-card plan-table"><div class="plan-table-inner"><div class="plan-grid plan-overview" id="plan-overview">'+summaryCells(estimate)+'</div>'+
  '<div class="plan-grid plan-table-head">'+['Название','Разряд','Участников','Счёт','Схема','Настройки схемы'].map(label=>'<span>'+label+'</span>').join('')+'</div>'+
  draft.categories.map((category,i)=>planRow(category,i,estimate.categories[i])).join('')+'</div></section>'+
  '<p class="table-note">Прогноз учитывает общие корты и заданный отдых между играми.</p>';
}
function liveForecast(){
 const estimate=P.estimate(state,{actual:true,now:gameNow()});
 return '<section class="live-forecast">'+timingStatus(estimate,true)+'<span>Сыграно '+estimate.done+' из '+estimate.count+'</span><a href="#tournament">Турнир</a></section>';
}
function updatePlanMetrics(){
 const estimate=peekPlan();
 $('#plan-overview').innerHTML=summaryCells(estimate);
 estimate.categories.forEach((metric,i)=>{
  $('#plan-metric-'+i).innerHTML=categoryCells(metric);
  $('#plan-error-'+i).textContent=metric.error;
 });
}
function updatePlanField(target,commit){
 if(mode!=='real'||state.closed||view!=='tournament'||!planDraft)return;
 const {planSetting,plan:field,index}=target.dataset||{};
 if(planSetting){
  if(state.started&&planSetting==='courts')return;
  let value=target.value;
  if(planSetting==='rentalMinutes')value=T.parseRentalDuration(value);
  if(planSetting==='courts'||planSetting==='restMinutes')value=value.trim()===''?NaN:Number(value);
  planDraft.settings[planSetting]=value;
  updatePlanMetrics();
  return;
 }
 if(!field||state.started)return;
 const category=planDraft.categories[Number(index)];
 if(!category)return;
 if(field==='name'){category.name=target.value;return;}
 if(field==='planned'){
  category.planned=Number(target.value);
  if(commit&&category.scheme==='groups')normalizeGroupPlan(category);
  if(commit&&['swiss','groups'].includes(category.scheme)){
   $('#plan-options-'+index).innerHTML=schemeSettings(category,Number(index),category.scheme,false);
  }
  updatePlanMetrics();
  return;
 }else if(!commit)return;
 else if(field==='division'){
  const base=T.divisions.find(c=>c.id===target.value);
  Object.assign(category,{division:base.id,code:base.code,doubles:base.doubles,short:base.short});
 }else if(field==='groupCount'){
  category.groupCount=Number(target.value);
  normalizeGroupPlan(category);
 }else if(field==='playoffCount'){
  const count=Number(target.value);
  category.playoffs=Array.from({length:count},(_,i)=>category.playoffs[i]||{mode:'single'});
  category.routes=category.routes.map(value=>value>count?0:value);
 }else if(field==='preset'){
  if(!target.value)return;
  applyPlanPreset(category,target.value);
 }else if(field.startsWith('bracket-'))category.playoffs[Number(field.split('-')[1])].mode=target.value;
 else if(field.startsWith('route-'))category.routes[Number(field.split('-')[1])]=Number(target.value);
 else {
  category[field]=['rounds','circles'].includes(field)?Number(target.value):target.value;
  if(field==='scheme'&&target.value==='groups')normalizeGroupPlan(category);
 }
 render();
}
function applyPlanPreset(category,id){
 category.groupCount=id==='triple'?4:2;
 category.routes=id==='semis'?[1,1,0,0]:[1,2,3,0];
 category.playoffs=Array.from({length:id==='semis'?1:3},()=>({mode:id==='triple'?'bronze':'single'}));
 normalizeGroupPlan(category);
}
document.addEventListener('input',event=>updatePlanField(event.target,false));
document.addEventListener('change',event=>updatePlanField(event.target,true));
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');
 if(!target||boardMode||mode!=='real'||state.closed||view!=='tournament'||!planDraft||!editorReady)return;
 const {action,index}=target.dataset;
 if(action==='save-plan'){
  const error=planSettingError(planDraft.settings);
  if(error){toast(error);return;}
  try{
   const next=structuredClone(planDraft);
   if(!state.started)for(const category of next.categories){
    category.name=category.name.trim();
    if(Array.from(category.name).length>5)throw Error('Название категории должно содержать не более 5 символов.');
    B.validPlan(category,category.planned);
   }
   mutate(s=>{s.settings=next.settings;if(!s.started)s.categories=next.categories;},'Турнир сохранён');
  }catch(error){toast(error.message);}
  return;
 }
 if(state.started)return;
 switch(action){
 case 'add-plan-category':{
  if(planDraft.categories.length>=5)return;
  const base=T.divisions.find(c=>!planDraft.categories.some(plan=>(plan.division||plan.id)===c.id))||T.divisions[0];
  planDraft.categories.push(defaultPlan({...base,id:'cat-'+crypto.randomUUID(),division:base.id,name:base.code},8));
  render();break;
 }
 case 'remove-plan-category':
  if(planDraft.categories.length>1&&!state.entries.some(e=>e.category===planDraft.categories[index]?.id)){planDraft.categories.splice(Number(index),1);render();}
  break;
 case 'actual-count':{
  const category=planDraft.categories[index],count=state.entries.filter(e=>e.category===category.id).length;
  if(count<2){toast('В составе пока меньше двух участников.');break;}
  category.planned=count;
  if(category.scheme==='groups')normalizeGroupPlan(category);
  render();break;
 }
 }
});
