'use strict';
const B=SwissCourtBrackets,P=SwissCourtPlanning;
let planDraft=null,manualSeedDraft=null;
const planField=(label,element)=>'<label class="field"><span>'+label+'</span>'+element+'</label>';
const planOptions=(values,selected)=>Object.entries(values).map(([value,label])=>'<option value="'+esc(value)+'" '+(String(selected)===value?'selected':'')+'>'+esc(label)+'</option>').join('');
const minutesText=minutes=>{const total=Math.ceil(Math.abs(minutes));return (total>=60?Math.floor(total/60)+' ч ':'')+total%60+' мин';};
function plannedTime(minutes){
 const time=Math.ceil(minutes);
 return String(Math.floor(time/60)%24).padStart(2,'0')+':'+String(time%60).padStart(2,'0')+(time>=1440?' +'+Math.floor(time/1440)+' д.':'');
}
function timingStatus(estimate){
 if(estimate.invalid)return '<div class="plan-state warn">Проверьте настройки категорий</div>';
 const fits=estimate.reserve>=0;
 return '<div class="plan-state '+(fits?'fits':'overrun')+'"><strong>'+(fits?'Укладываемся в аренду':'Выходим за время аренды')+'</strong><span>'+
  (fits?'Запас ':'Превышение ')+minutesText(estimate.reserve)+' · Окончание около '+plannedTime(estimate.finish)+'</span></div>';
}
function defaultPlan(category,n){
 return {...structuredClone(category),planned:Math.max(2,n||8),scheme:category.scheme||(n>=2&&n<7?'circle':'swiss'),
  scoreFormat:category.scoreFormat||'classic',seeding:category.seeding||'rating',
  bracketMode:category.bracketMode||'single',groupCount:category.groupCount||2,playoffs:category.playoffs||[]};
}
function ensurePlanDraft(){
 if(planDraft?.id===state.id&&planDraft.revision===state.revision)return;
 planDraft={id:state.id,revision:state.revision,settings:{...state.settings},
  categories:state.categories.map(c=>defaultPlan(c,state.entries.filter(e=>e.category===c.id).length))};
}
function peekPlan(){
 const draft={...state,settings:planDraft.settings,categories:planDraft.categories};
 return P.estimate(draft);
}
function planOverview(estimate){
 return timingStatus(estimate)+'<div class="plan-totals"><span><b>'+estimate.count+'</b> встреч</span><span><b>'+minutesText(estimate.court)+'</b> на кортах</span><span><b>'+minutesText(estimate.duration)+'</b> в зале</span></div>';
}
function planMetrics(metric){
 if(metric.error)return '<p class="notice warn">'+esc(metric.error)+'</p>';
 return '<div class="plan-metrics"><span><b>'+metric.count+'</b> встреч</span><span><b>'+minutesText(metric.court)+'</b> на кортах</span><span><b>'+minutesText(metric.span)+'</b> в зале</span><span>≈ '+Math.round(metric.duration)+' мин на встречу</span></div>';
}
function slotsFor(category,n=category.planned){
 return B.groupSizes(n,category.groupCount).flatMap((size,group)=>Array.from({length:Math.min(size,4)},(_,index)=>({group,place:index+1})));
}
function setDefaultPlayoffs(category){
 const slots=slotsFor(category),winners=slots.filter(slot=>slot.place===1);
 category.playoffs=[{mode:'single',slots:winners.length>=2?winners:slots.slice(0,2)}];
}
function normalizeGroupPlan(category){
 if(category.planned>=2&&category.planned<=16){
  const valid=Array.from({length:4},(_,i)=>i+1).filter(count=>B.groupSizes(category.planned,count).every(n=>n>=2&&n<=4));
  if(valid.length&&!valid.includes(category.groupCount))category.groupCount=valid[0];
 }
 const allowed=slotsFor(category);
 for(const bracket of category.playoffs)bracket.slots=bracket.slots.filter(slot=>allowed.some(s=>s.group===slot.group&&s.place===slot.place));
 if(!category.playoffs.length||category.playoffs.length===1&&category.playoffs[0].slots.length<2)setDefaultPlayoffs(category);
}
function playoffPresets(category){
 const n=category.planned;
 if((n===6||n===7)&&category.groupCount===2)return [
  ['places','Финалы за 1-е, 3-е и 5-е'],['semis','Два из группы в полуфиналы']
 ];
 if(n===12&&category.groupCount===4)return [['triple','Три сетки с бронзой']];
 return [];
}
function planCard(category,index,metric){
 const actual=state.entries.filter(e=>e.category===category.id).length;
 const select=(field,values,value,disabled=false)=>'<select class="form-control" data-plan="'+field+'" data-index="'+index+'" '+(disabled?'disabled':'')+'>'+planOptions(values,value)+'</select>';
 const number='<input class="form-control" type="number" min="2" max="32" data-plan="planned" data-index="'+index+'" value="'+category.planned+'">';
 const name='<input class="form-control" maxlength="100" data-plan="name" data-index="'+index+'" value="'+esc(category.name)+'">';
 const fields=planField('Название категории',name)+planField('Разряд',select('division',Object.fromEntries(T.divisions.map(c=>[c.id,c.code+' · '+c.name])),category.division||category.id,actual>0))+
  planField('Участников / пар по плану',number)+planField('Схема',select('scheme',B.schemes,category.scheme))+
  planField('Формат счёта',select('scoreFormat',Object.fromEntries(Object.entries(C.scoreFormats).map(([key,f])=>[key,f.label])),category.scoreFormat))+
  planField('Посев',select('seeding',{rating:category.scheme==='groups'?'По рейтингу, змейкой':'По рейтингу',random:'По жребию',manual:'Вручную перед запуском'},category.seeding));
 let extra='';
 if(category.scheme==='swiss')extra='<div class="plan-config">'+planField('Туров',select('rounds',{3:'3',4:'4',5:'5',6:'6'},category.rounds))+'</div>';
 if(category.scheme==='knockout')extra='<div class="plan-config">'+planField('Вариант олимпийки',select('bracketMode',B.modes,category.bracketMode))+'</div>';
 if(category.scheme==='groups'){
  const sizes=B.groupSizes(category.planned,category.groupCount);
  const groupFields=planField('Групп',select('groupCount',{1:'1',2:'2',3:'3',4:'4'},category.groupCount))+
   planField('Сеток плей-офф',select('playoffCount',{1:'1',2:'2',3:'3',4:'4'},category.playoffs.length));
  const presets=playoffPresets(category).map(([id,label])=>'<button class="btn small" data-action="plan-preset" data-index="'+index+'" data-id="'+id+'">'+label+'</button>').join('');
  const bracketModes=category.playoffs.map((bracket,i)=>planField('Сетка '+(i+1)+' · вариант',select('bracket-'+i,B.modes,bracket.mode))).join('');
  const targetOptions={0:'Завершить после группы',...Object.fromEntries(category.playoffs.map((_,i)=>[i+1,'Сетка '+(i+1)]))};
  const assignments=slotsFor(category).map(({group,place})=>{
   const assigned=1+category.playoffs.findIndex(b=>b.slots.some(s=>s.group===group&&s.place===place));
   return planField('Группа '+B.letter(group)+' · '+place+'-е место',select('slot-'+group+'-'+place,targetOptions,assigned));
  }).join('');
  extra='<div class="plan-config">'+groupFields+'</div><p>Состав групп '+sizes.map((size,i)=>B.letter(i)+' · '+size).join(' / ')+'</p>'+
   (presets?'<div class="plan-presets">'+presets+'</div>':'')+'<div class="plan-config">'+bracketModes+'</div><div class="plan-slots">'+assignments+'</div>';
 }
 return '<section class="panel plan-card"><div class="spread"><h2>'+esc(category.code)+' · '+esc(category.name)+'</h2>'+
  '<button class="btn small" data-action="remove-plan-category" data-index="'+index+'" '+(actual||planDraft.categories.length===1?'disabled':'')+'>Удалить категорию</button></div>'+
  '<div class="plan-config">'+fields+'</div>'+extra+'<div id="plan-metric-'+index+'">'+planMetrics(metric)+'</div>'+
  (actual?'<small>В составе '+actual+(actual!==category.planned?' · число встреч после жеребьёвки считается по фактическому составу. <button class="btn small" data-action="actual-count" data-index="'+index+'">Взять из состава</button>':'')+'</small>':'')+'</section>';
}
function planner(){
 if(state.started)return heading('План и ход турнира','Оценка обновляется по фактическим результатам.')+liveForecast(true);
 ensurePlanDraft();
 const draft=planDraft,estimate=peekPlan();
 const hasRoster=state.entries.length>0;
 const setting=(label,key,type)=>planField(label,'<input class="form-control" type="'+type+'" data-plan-setting="'+key+'" value="'+esc(draft.settings[key])+'" '+(type==='number'?'min="1" max="32"':'')+'>');
 return heading('Планирование турнира','Подберите схему и формат счёта для каждой категории. Все категории используют общие корты.',
  '<button class="btn primary" data-action="save-plan">Сохранить план</button>')+
  '<section class="panel plan-card"><h2>Зал и аренда</h2><div class="plan-config">'+setting('Зал','venue','text')+
  setting('Начало','start','time')+setting('Окончание','end','time')+setting('Кортов','courts','number')+'</div></section>'+
  '<section class="panel plan-card plan-overview" id="plan-overview">'+planOverview(estimate)+'</section>'+
  (hasRoster?'<p class="table-note">После ввода участников можно пересчитать план по фактическому составу.</p>':'')+
  '<div class="plan-category-list">'+draft.categories.map((c,i)=>planCard(c,i,estimate.categories[i])).join('')+'</div>'+
  '<div class="plan-actions"><button class="btn" data-action="add-plan-category" '+(draft.categories.length>=5?'disabled':'')+'>Добавить категорию</button>'+
  '<button class="btn primary" data-action="save-plan">Сохранить план</button><a class="btn" href="#participants">Участники</a></div>'+
  '<p class="table-note">Прогноз включает '+P.rest+' минут отдыха между встречами одного участника. Время зависит от длительности игр и доступности кортов.</p>';
}
function liveForecast(expanded=false){
 const estimate=P.estimate(state,{actual:true,now:gameNow()});
 if(expanded)return '<section class="panel plan-card">'+planOverview(estimate)+estimate.categories.map(metric=>
  '<div class="config-row"><strong>'+esc(cat(metric.id).name)+'</strong>'+planMetrics(metric)+'</div>').join('')+'</section>';
 return '<section class="live-forecast">'+timingStatus(estimate)+'<span>Сыграно '+estimate.done+' из '+estimate.count+'</span><a href="#plan">План</a></section>';
}
function planSettingValid(settings){
 return Number.isInteger(settings.courts)&&settings.courts>=1&&settings.courts<=32&&/^\d\d:\d\d$/.test(settings.start)&&/^\d\d:\d\d$/.test(settings.end)&&settings.start<settings.end;
}
function updatePlanMetrics(){
 const estimate=peekPlan();
 $('#plan-overview').innerHTML=planSettingValid(planDraft.settings)?planOverview(estimate):'<div class="plan-state warn">Проверьте время аренды и число кортов.</div>';
 estimate.categories.forEach((metric,i)=>{$('#plan-metric-'+i).innerHTML=planMetrics(metric);});
}
function updatePlanField(target,commit){
 if(mode!=='real'||state.started||view!=='plan'||!planDraft)return;
 const {planSetting,plan:field,index}=target.dataset||{};
 if(planSetting){
  planDraft.settings[planSetting]=planSetting==='courts'?Number(target.value):target.value;
  if(planSettingValid(planDraft.settings))updatePlanMetrics();
  else $('#plan-overview').innerHTML='<div class="plan-state warn">Проверьте время аренды и число кортов.</div>';
  return;
 }
 if(!field)return;
 const category=planDraft.categories[Number(index)];
 if(!category)return;
 if(field==='name'){category.name=target.value;return;}
 if(field==='planned'){
  category.planned=Number(target.value);
  if(!commit){updatePlanMetrics();return;}
  if(category.scheme==='groups')normalizeGroupPlan(category);
 }else if(!commit)return;
 else if(field==='division'){
  const base=T.divisions.find(c=>c.id===target.value);
  Object.assign(category,{division:base.id,code:base.code,doubles:base.doubles,short:base.short,name:base.name});
 }else if(field==='groupCount'){
  category.groupCount=Number(target.value);
  for(const bracket of category.playoffs)bracket.slots=bracket.slots.filter(slot=>slotsFor(category).some(s=>s.group===slot.group&&s.place===slot.place));
 }else if(field==='playoffCount'){
  const count=Number(target.value);
  category.playoffs=Array.from({length:count},(_,i)=>category.playoffs[i]||{mode:'single',slots:[]});
 }else if(field.startsWith('bracket-'))category.playoffs[Number(field.split('-')[1])].mode=target.value;
 else if(field.startsWith('slot-')){
  const [,group,place]=field.split('-').map(Number);
  for(const bracket of category.playoffs)bracket.slots=bracket.slots.filter(s=>s.group!==group||s.place!==place);
  if(Number(target.value)>0)category.playoffs[Number(target.value)-1].slots.push({group,place});
 }else{
  category[field]=field==='rounds'?Number(target.value):target.value;
  if(field==='scheme'&&target.value==='groups')normalizeGroupPlan(category);
 }
 render();
}
function applyPlanPreset(category,id){
 const slots=slotsFor(category),tier=place=>slots.filter(slot=>slot.place===place);
 if(id==='semis')category.playoffs=[{mode:'single',slots:[...tier(1),...tier(2)]}];
 else if(id==='places'||id==='triple')category.playoffs=[1,2,3].map(place=>({mode:id==='triple'?'bronze':'single',slots:tier(place)}));
}
function openManualSeed(id){
 const c=cat(id),ranked=T.seeded(state,id).map(e=>e.id);
 const previous=c.manualOrder||[];
 manualSeedDraft={id,order:[...previous.filter(id=>ranked.includes(id)),...ranked.filter(id=>!previous.includes(id))]};
 renderManualSeed();
}
function renderManualSeed(){
 const {id,order}=manualSeedDraft,c=cat(id);
 const displayGroup=index=>{
  if(c.scheme!=='groups')return '';
  const row=Math.floor(index/c.groupCount),col=index%c.groupCount;
  return ' · группа '+B.letter(row%2&&(row+1)*c.groupCount<=order.length?c.groupCount-1-col:col);
 };
 dialog('Ручной посев',esc(c.name),'<div class="seed-list">'+order.map((entry,index)=>
  planField('Посев '+(index+1)+displayGroup(index),'<select class="form-control" data-seed-index="'+index+'">'+
   planOptions(Object.fromEntries(order.map(id=>[id,surnames(id)])),entry)+'</select>')).join('')+'</div>',
  cancel+'<button class="btn primary" data-action="save-manual-seed">Сохранить посев</button>');
}
document.addEventListener('input',event=>updatePlanField(event.target,false));
document.addEventListener('change',event=>{
 updatePlanField(event.target,true);
 const index=event.target.dataset?.seedIndex;
 if(index===undefined||!manualSeedDraft)return;
 const order=manualSeedDraft.order,i=Number(index),other=order.indexOf(event.target.value);
 [order[i],order[other]]=[order[other],order[i]];
 renderManualSeed();
});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');
 if(!target||boardMode||mode!=='real'||state.started)return;
 const {action,index,id}=target.dataset;
 if(action==='manual-seed'){openManualSeed(id);return;}
 if(action==='save-manual-seed'&&manualSeedDraft){
  if(mutate(s=>{s.categories.find(c=>c.id===manualSeedDraft.id).manualOrder=manualSeedDraft.order;} ,'Посев сохранён'))$('#dialog').close();
  return;
 }
 if(!planDraft||view!=='plan')return;
 switch(action){
 case 'add-plan-category':{
  if(planDraft.categories.length>=5)return;
  const base=T.divisions.find(c=>!planDraft.categories.some(plan=>(plan.division||plan.id)===c.id))||T.divisions[0];
  planDraft.categories.push(defaultPlan({...base,id:'cat-'+crypto.randomUUID(),division:base.id,name:base.name+' '+(planDraft.categories.length+1)},8));
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
 case 'plan-preset':applyPlanPreset(planDraft.categories[index],id);render();break;
 case 'save-plan':{
  if(!planSettingValid(planDraft.settings)){toast('Проверьте время аренды и число кортов.');break;}
  try{
   const next=structuredClone(planDraft);
   for(const c of next.categories){
    if(!c.name.trim())throw Error('Укажите название каждой категории.');
    B.validPlan(c,c.planned);
   }
   mutate(s=>{s.settings=next.settings;s.categories=next.categories;},'План сохранён. Можно ввести составы.');
  }catch(error){toast(error.message);}
  break;
 }
 }
});
