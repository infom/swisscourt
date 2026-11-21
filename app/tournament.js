(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const B=root.SwissCourtBrackets||(typeof require==='function'?require('./brackets.js'):null);
const blossom=root.SwissCourtBlossom||(typeof require==='function'?require('edmonds-blossom-fixed'):null);
const divisions=[
 {id:'ms',code:'MS',name:'Мужской одиночный',short:'Мужчины',doubles:false,rounds:5},
 {id:'ws',code:'WS',name:'Женский одиночный',short:'Женщины',doubles:false,rounds:5},
 {id:'md',code:'MD',name:'Мужской парный',short:'Мужские пары',doubles:true,rounds:5},
 {id:'wd',code:'WD',name:'Женский парный',short:'Женские пары',doubles:true,rounds:5},
 {id:'xd',code:'XD',name:'Смешанный парный',short:'Микст',doubles:true,rounds:5},
 {id:'s',code:'S',name:'Одиночный',short:'Одиночный',doubles:false,rounds:5},
 {id:'d',code:'D',name:'Парный',short:'Парный',doubles:true,rounds:5}
];
const seedModes={all:'Все',four:'1, 2, 3–4',eight:'1, 2, 3–4, 5–8'};
const fail=message=>{throw Error(message);};
const key=(a,b)=>[a,b].sort().join('|');
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const id=()=>globalThis.crypto.randomUUID();
function parseRentalDuration(value){
 const match=String(value).trim().match(/^(\d+):([0-5]\d)$/);
 const minutes=match?Number(match[1])*60+Number(match[2]):NaN;
 return Number.isSafeInteger(minutes)&&minutes>0?minutes:NaN;
}
function rentalDuration(settings){
 if(settings.rentalMinutes!==undefined)return settings.rentalMinutes;
 const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
 if(!clock.test(settings.start)||!clock.test(settings.end))return NaN;
 const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
 return minutes(settings.end)-minutes(settings.start);
}
function newDay(now=new Date()){
 const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
 return {version:1,kind:'tournament',id:id(),revision:0,started:false,closed:false,
  settings:{title:'Клубный турнир',venue:'Юг-Арена',date:local,rentalMinutes:180,courts:7,level:'Любительский',prepareCount:4},
  categories:structuredClone(divisions.filter(c=>['md','wd'].includes(c.id))),entries:[],matches:[],byes:[],history:[]};
}
function validate(state,{ready=false}={}){
 if(!state||state.version!==1||state.kind!=='tournament'||!safeId(state.id)||!Number.isInteger(state.revision)||state.revision<0)fail('Неверный формат игрового дня.');
 if(typeof state.started!=='boolean'||typeof state.closed!=='boolean'||state.startedAt!==undefined&&(!state.started||!Number.isFinite(state.startedAt)||state.startedAt<0))fail('Неверное состояние турнира.');
 const s=state.settings;
 if(!s||!Number.isInteger(s.courts)||s.courts<1||s.courts>32||!/^\d{4}-\d{2}-\d{2}$/.test(s.date))fail('Проверьте дату и количество кортов.');
 if(!Number.isFinite(Date.parse(s.date+'T12:00:00Z'))||new Date(s.date+'T12:00:00Z').toISOString().slice(0,10)!==s.date)fail('Неверная дата турнира.');
 const rental=rentalDuration(s);
 if(!Number.isSafeInteger(rental)||rental<=0)fail('Укажите длительность аренды в формате ч:мм, например 2:30.');
 for(const name of ['title','venue','level'])if(typeof s[name]!=='string'||!s[name].trim()||s[name].length>100)fail('Заполните название, зал и дивизион.');
 if(!Array.isArray(state.categories)||state.categories.length<1||state.categories.length>5||new Set(state.categories.map(c=>c.id)).size!==state.categories.length)fail('Выберите от одной до пяти категорий.');
 for(const cat of state.categories){
  const known=divisions.find(c=>c.id===(cat.division||cat.id));
  if(!known||!safeId(cat.id)||cat.code!==known.code||cat.doubles!==known.doubles||![3,4,5,6,7].includes(cat.rounds)||typeof cat.name!=='string'||cat.name.length>100)fail('Проверьте параметры категорий.');
  if(cat.scheme)B.validPlan(cat,cat.planned);
 }
 if(!Array.isArray(state.entries)||!Array.isArray(state.matches)||!Array.isArray(state.byes)||!Array.isArray(state.history))fail('Повреждены данные турнира.');
 const partials=state.partialRounds||[];
 if(!Array.isArray(partials)||new Set(partials.map(p=>p.category)).size!==partials.length||partials.some(p=>!state.categories.some(c=>c.id===p.category)||!Number.isInteger(p.round)||p.round<2||p.round>roundCount(state,p.category)||schemeOf(state,p.category)!=='swiss'))fail('Неверные данные частично сформированного тура.');
 const ids=new Set(),players=new Set();
 for(const entry of state.entries){
  const category=state.categories.find(c=>c.id===entry.category);
  if(!category||!safeId(entry.id)||ids.has(entry.id)||!Array.isArray(entry.players)||entry.players.length!==(category.doubles?2:1))fail('Проверьте состав участников.');ids.add(entry.id);
  for(const p of entry.players){
   if(typeof p.name!=='string'||p.name.trim().split(/\s+/).length<2||p.name.length>160)fail('Нужны фамилия и имя каждого игрока.');
   const identity=p.sourceId?'source:'+p.sourceId:C.normalizeName(p.name);
   const name=C.normalizeName(p.name);
   if(players.has(identity)||players.has(name))fail('Игрок '+C.playerFullName(p)+' уже есть в игровом дне.');players.add(identity);players.add(name);
   if(p.rating!=null&&(!Number.isFinite(p.rating)||p.rating<0||p.rating>99999))fail('Рейтинг должен быть числом от 0 до 99999.');
   for(const part of ['surname','givenName','sourceId'])if(p[part]!==undefined&&(typeof p[part]!=='string'||p[part].length>200))fail('Неверные данные игрока.');
  }
 }
 for(const cat of state.categories){
  const n=state.entries.filter(e=>e.category===cat.id).length;
  if(n>32)fail(cat.name+': максимум 32 участника.');
  if((ready||state.started)&&n<2)fail(cat.code+': нужно не меньше двух участников / пар.');
  if(cat.scheme&&(ready||state.started))B.validPlan(cat,n);
 }
 const seenIds=new Set(),seenRounds=new Set(),seenPairs=new Set(),occupied=new Set(),active=new Set();
 for(const m of state.matches){
  if(!safeId(m.id)||typeof m.pinned!=='boolean'||seenIds.has(m.id)||!ids.has(m.a)||!ids.has(m.b)||m.a===m.b||!Number.isInteger(m.round)||m.round<1||!['queued','playing','done'].includes(m.status))fail('Повреждена встреча.');seenIds.add(m.id);
  if([m.a,m.b].some(eid=>state.entries.find(e=>e.id===eid).category!==m.category))fail('Встреча смешивает разряды.');
  const type=schemeOf(state,m.category),leg=type==='circle'?Math.floor((m.round-1)/B.circleRounds(state.entries.filter(e=>e.category===m.category).length)):0;
  const pair=key(m.a,m.b)+':'+leg;
  if(!isBracket(state,m.category)||m.bracket===undefined){if(seenPairs.has(pair))fail('Повторные соперники в основных турах.');seenPairs.add(pair);}
  for(const eid of [m.a,m.b]){const rk=eid+':'+m.round;if(seenRounds.has(rk))fail('Две встречи участника в одном туре.');seenRounds.add(rk);}
  if(m.status==='playing'){
   if(!Number.isInteger(m.court)||m.court<1||m.court>s.courts||occupied.has(m.court)||!Number.isFinite(m.startedAt))fail('Конфликт или неверный номер корта.');occupied.add(m.court);
   for(const eid of [m.a,m.b]){if(active.has(eid))fail('Игрок уже на другом корте.');active.add(eid);}
  }
  if(m.status==='done'&&(!Array.isArray(m.scores)||m.scores.some(g=>!Array.isArray(g)||g.length!==2||g.some(v=>!Number.isInteger(v)))||!C.matchResult(state,m).ok||!Number.isFinite(m.endedAt)))fail('Неверный результат встречи.');
 }
 const byeEntries=new Set();
 for(const bye of state.byes){
  const e=state.entries.find(e=>e.id===bye.entryId),rk=bye.entryId+':'+bye.round;
  if(!safeId(bye.id)||!e||schemeOf(state,bye.category)!=='swiss'||e.category!==bye.category||!Number.isInteger(bye.round)||bye.round<1||!state.matches.some(m=>m.category===bye.category&&m.round===bye.round)||seenRounds.has(rk)||byeEntries.has(e.id))fail('Неверный или повторный пропуск тура.');
  seenRounds.add(rk);byeEntries.add(e.id);
 }
 const matchById=new Map(state.matches.map(m=>[m.id,m]));
 for(const h of state.history){
  const match=matchById.get(h.matchId);
  if(!match||!Number.isFinite(h.at)||!Array.isArray(h.old)||!Array.isArray(h.new)||
   !C.matchResult(state,match,h.old,h.oldLot??null).ok||!C.matchResult(state,match,h.new,h.newLot??null).ok)fail('Повреждена история исправлений.');
 }
 if(!state.started&&(state.matches.length||state.byes.length||partials.length))fail('Незапущенный день содержит встречи.');
 if(state.started)for(const cat of state.categories){
  const n=state.entries.filter(e=>e.category===cat.id).length,matches=state.matches.filter(m=>m.category===cat.id),partial=partials.find(p=>p.category===cat.id),rounds=Math.max(partial?.round||0,...matches.map(m=>m.round));
  if(isBracket(state,cat.id)){validateBracket(state,cat,matches);continue;}
  if(rounds<1||rounds>roundCount(state,cat.id))fail('Неверное число опубликованных туров.');
  if(partial&&partial.round!==rounds)fail('Только последний тур может быть сформирован частично.');
  for(let r=1;r<=rounds;r++){
   const current=matches.filter(m=>m.round===r),isPartial=partial?.round===r;
   if(isPartial?(current.length>Math.floor(n/2)||current.some(m=>m.early!==true)):current.length!==Math.floor(n/2))fail('В туре отсутствуют встречи.');
   if(state.byes.filter(b=>b.category===cat.id&&b.round===r).length!==(schemeOf(state,cat.id)==='swiss'&&!isPartial?n%2:0))fail('Неверные пропуски тура.');
   for(const m of current.filter(m=>m.status!=='queued'))if(matches.some(previous=>previous.round<r&&previous.status!=='done'&&[previous.a,previous.b].some(eid=>[m.a,m.b].includes(eid))))fail('Пара ещё не завершила свою предыдущую встречу.');
  }
 }
 if(state.closed&&(!state.started||!state.categories.every(c=>roundStatus(state,c.id).complete)))fail('День ещё не завершён.');
 return state;
}
function seeded(state,category){
 return state.entries.filter(e=>e.category===category).slice().sort((a,b)=>C.rating(b)-C.rating(a)||C.entryLabel(state,a.id).localeCompare(C.entryLabel(state,b.id),'ru')||a.id.localeCompare(b.id));
}
function schemeOf(state,category){
 return state.categories.find(c=>c.id===category)?.scheme||(state.entries.filter(e=>e.category===category).length<7?'circle':'swiss');
}
function isBracket(state,category){return ['knockout','groups'].includes(schemeOf(state,category));}
function roundCount(state,category){
 const n=state.entries.filter(e=>e.category===category).length,cat=state.categories.find(c=>c.id===category);
 if(isBracket(state,category)&&state.started)return Math.max(...bracketContext(state,category).nodes.map(node=>node.round));
 return schemeOf(state,category)==='circle'?B.circleRounds(n)*(cat.circles||1):cat.rounds;
}
function roundStatus(state,category){
 const matches=state.matches.filter(m=>m.category===category),partial=(state.partialRounds||[]).find(p=>p.category===category);
 const round=Math.max(partial?.round||0,...matches.map(m=>m.round)),pending=matches.some(m=>m.status!=='done');
 const totalRounds=roundCount(state,category);
 if(isBracket(state,category))return {round,totalRounds,pending,complete:state.started&&matches.filter(m=>m.status==='done').length===totalMatches(state,category),canDraw:false};
 return {round,totalRounds,pending,partial:!!partial,complete:state.started&&round>=totalRounds&&!pending&&!partial,canDraw:state.started&&!state.closed&&!pending&&!partial&&round<totalRounds};
}
function totalMatches(state,category){
 const cat=state.categories.find(c=>c.id===category),n=state.entries.filter(e=>e.category===category).length;
 if(cat.scheme&&n>=2){try{B.validPlan(cat,n);return B.matchCount(cat,n);}catch{return 0;}}
 return n<7?n*(n-1)/2:Math.floor(n/2)*cat.rounds;
}
function shuffle(items){
 for(let i=items.length-1;i>0;i--){
  const j=Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/2**32*(i+1));
  [items[i],items[j]]=[items[j],items[i]];
 }
 return items;
}
function seedLabels(state,category){
 const mode=state.seedPlans?.[category];
 const ranked=seeded(state,category).map(e=>e.id);
 if(!Object.hasOwn(seedModes,mode))return new Map();
 if(mode==='all')return new Map(ranked.map((id,index)=>[id,String(index+1)]));
 const labels=['1','2','3–4','3–4','5–8','5–8','5–8','5–8'];
 return new Map(ranked.slice(0,mode==='four'?4:8).map((id,index)=>[id,labels[index]]));
}
function drawFingerprint(state,category){
 const c=state.categories.find(cat=>cat.id===category);
 return JSON.stringify([schemeOf(state,category),c?.division||c?.code,c?.circles,c?.rounds,c?.groupCount,c?.playoffs,c?.routes,c?.bracketMode,state.seedPlans?.[category],
  state.entries.filter(e=>e.category===category).map(e=>[e.id,e.players.map(p=>[p.name,p.rating])])]);
}
function preparedOrder(state,category){
 const draw=state.preparedDraws?.[category];
 if(!draw||draw.fingerprint!==drawFingerprint(state,category)||!Array.isArray(draw.order))return null;
 const roster=state.entries.filter(e=>e.category===category).map(e=>e.id);
 return draw.order.length===roster.length&&new Set(draw.order).size===roster.length&&draw.order.every(id=>roster.includes(id))?draw.order:null;
}
function clearDraw(state,category){
 if(state.started)fail('Турнир уже начался.');
 if(state.preparedDraws)delete state.preparedDraws[category];
}
function setSeedMode(state,category,mode){
 if(mode&&!Object.hasOwn(seedModes,mode))fail('Выберите вариант посева.');
 clearDraw(state,category);
 state.seedPlans??={};
 if(mode)state.seedPlans[category]=mode;else delete state.seedPlans[category];
}
function prepareDraw(state,category){
 if(state.started)fail('Турнир уже начался.');
 const c=state.categories.find(cat=>cat.id===category),ranked=seeded(state,category).map(e=>e.id);
 if(ranked.length<2)fail('Добавьте не меньше двух участников.');
 if(c.scheme)B.validPlan(c,ranked.length);
 const labels=seedLabels(state,category),previous=preparedOrder(state,category);
 const unseeded=shuffle(ranked.filter(id=>!labels.has(id)));
 let order;
 if(previous)order=previous.map(id=>labels.has(id)?id:unseeded.shift());
 else {
  const bands=new Map();
  for(const [id,label] of labels){
   if(!bands.has(label))bands.set(label,[]);
   bands.get(label).push(id);
  }
  order=[...Array.from(bands.values()).flatMap(shuffle),...unseeded];
 }
 state.preparedDraws??={};
 state.preparedDraws[category]={fingerprint:drawFingerprint(state,category),order};
 return order;
}
function swapDraw(state,category,a,b){
 if(state.started)fail('Турнир уже начался.');
 const order=preparedOrder(state,category),first=order?.indexOf(a),second=order?.indexOf(b);
 if(!order||first<0||second<0)fail('Проверьте жеребьёвку.');
 [order[first],order[second]]=[order[second],order[first]];
}
function pruneDraws(state){
 if(state.started)return;
 for(const category of Object.keys(state.preparedDraws||{}))if(!preparedOrder(state,category))delete state.preparedDraws[category];
 for(const category of Object.keys(state.seedPlans||{}))if(!state.categories.some(c=>c.id===category))delete state.seedPlans[category];
}
function drawOrder(state,category){
 const cat=state.categories.find(c=>c.id===category),ranked=seeded(state,category).map(e=>e.id);
 const order=state.drawOrders?.[category]||preparedOrder(state,category)||(cat.seeding==='manual'?cat.manualOrder:cat.seeding==='random'?shuffle(ranked.slice()):ranked);
 if(!Array.isArray(order)||order.length!==ranked.length||new Set(order).size!==ranked.length||order.some(id=>!ranked.includes(id)))fail('Проверьте ручной посев категории '+cat.name+'.');
 return order;
}
function groupRank(state,category,group,ids){
 const data={...state,entries:state.entries.filter(e=>ids.includes(e.id)),matches:state.matches.filter(m=>m.category===category&&m.group===group),byes:[]};
 const lot=state.groupLots?.[category]||ids;
 const rows=circleStandings(data,category).sort((a,b)=>a.place-b.place||lot.indexOf(a.entry.id)-lot.indexOf(b.entry.id));
 if(data.matches.filter(m=>m.status==='done').length===ids.length*(ids.length-1)/2)rows.forEach((row,index)=>{
  if(row.tied){row.qualificationLot=true;row.place=index+1;row.tied=false;}
 });
 return rows;
}
function bracketContext(state,category){
 return B.context(state,state.categories.find(c=>c.id===category),groupRank);
}
function validateBracket(state,category,matches){
 const order=drawOrder(state,category.id);
 if(!state.drawOrders?.[category.id]||!Array.isArray(order))fail('Отсутствует посев сетки.');
 if(category.scheme==='groups'){
  const lot=state.groupLots?.[category.id];
  if(!Array.isArray(lot)||lot.length!==order.length||new Set(lot).size!==order.length||lot.some(id=>!order.includes(id)))fail('Отсутствует жребий группы.');
 }
 const context=bracketContext(state,category.id);
 if(context.expected.length!==matches.length)fail('Состав сетки изменился. Проверьте результаты.');
 const expected=new Map(context.expected.map(m=>[m.id,m]));
 for(const match of matches){
  const node=expected.get(match.id);
  if(!node||['a','b','round','group','bracket','stage','forPlace'].some(key=>node[key]!==match[key]))fail('Соперники в уже начавшейся сетке изменились.');
  if(match.group===undefined&&match.status!=='queued'&&matches.some(m=>m.round<match.round&&m.status!=='done'&&[m.a,m.b].some(id=>id===match.a||id===match.b)))fail('Пара ещё не завершила свою предыдущую встречу.');
 }
}
function refreshBracket(state,category){
 const context=bracketContext(state,category),expected=new Map(context.expected.map(m=>[m.id,m]));
 for(const match of context.matches.values()){
  const next=expected.get(match.id);
  if((!next||match.a!==next.a||match.b!==next.b)&&match.status!=='queued')fail('Это изменение меняет участников уже начавшейся встречи сетки.');
 }
 state.matches=state.matches.filter(m=>m.category!==category||m.status!=='queued'||
  (expected.has(m.id)&&expected.get(m.id).a===m.a&&expected.get(m.id).b===m.b));
 const current=new Set(state.matches.map(m=>m.id));
 for(const match of expected.values())if(!current.has(match.id))state.matches.push(match);
}
function groupStandings(state,category){
 const layout=bracketContext(state,category);
 return layout.groups.map((ids,group)=>groupRank(state,category,group,ids));
}
const addCost=(a,b)=>a.map((v,i)=>v+b[i]);
const compareCost=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
function* perfectPairs(vertices,allowed){
 if(!vertices.length){yield [];return;}
 let first=vertices[0],options=vertices.filter(j=>j!==first&&allowed(first,j));
 for(const i of vertices.slice(1)){
  const candidates=vertices.filter(j=>j!==i&&allowed(i,j));
  if(candidates.length<options.length){first=i;options=candidates;}
 }
 for(const other of options){
  const rest=vertices.filter(i=>i!==first&&i!==other);
  for(const tail of perfectPairs(rest,allowed))yield [[first,other],...tail];
 }
}
function swissContinuation(state,category,round,ids,locked){
 const later=roundCount(state,category)-round;
 if(later===0||ids.length+ids.length%2>=2*roundCount(state,category))return ()=>true;
 const players=ids.length%2?[...ids,null]:ids;
 const positions=new Map(players.map((id,index)=>[id,index]));
 const vertices=players.map((_,index)=>index);
 const bit=(i,j)=>1n<<BigInt(Math.max(i,j)*(Math.max(i,j)-1)/2+Math.min(i,j));
 const pairBit=(a,b)=>bit(positions.get(a),positions.get(b));
 let initial=0n;
 for(const m of [...state.matches.filter(m=>m.category===category),...locked])initial|=pairBit(m.a,m.b);
 for(const bye of state.byes.filter(b=>b.category===category))initial|=pairBit(bye.entryId,null);
 const memo=new Map();
 function possible(used,depth){
  if(depth===0)return true;
  const allowed=(i,j)=>!(used&bit(i,j)),key=depth+':'+used;
  if(memo.has(key))return memo.get(key);
  for(const pairs of perfectPairs(vertices,allowed)){
   if(possible(pairs.reduce((mask,[a,b])=>mask|bit(a,b),used),depth-1)){memo.set(key,true);return true;}
  }
  memo.set(key,false);return false;
 }
 return (pairs,bye)=>possible(pairs.reduce((mask,[a,b])=>mask|pairBit(a,b),initial)|(bye?pairBit(bye,null):0n),later);
}
function swissPairs(state,category,round,{locked=[],points=null}={}){
 const ids=drawOrder(state,category),entries=ids.map(id=>state.entries.find(e=>e.id===id)),rank=new Map(ids.map((id,i)=>[id,i]));
 const rows=(points?entries.map(entry=>({entry,points:points.get(entry.id)})):C.standings(state,category)).sort((a,b)=>b.points-a.points||rank.get(a.entry.id)-rank.get(b.entry.id));
 const lockedIds=new Set(locked.flatMap(m=>[m.a,m.b]));
 const seen=new Set(state.matches.map(m=>key(m.a,m.b)));
 const candidates=rows.length%2?rows.filter(r=>!lockedIds.has(r.entry.id)&&!state.byes.some(b=>b.entryId===r.entry.id)).slice().reverse():[null];
 const canContinue=round===1?()=>true:swissContinuation(state,category,round,ids,locked);
 for(const bye of candidates){
  const rest=rows.filter(r=>r!==bye&&!lockedIds.has(r.entry.id));
  if(round===1){const half=rest.length/2;return {pairs:rest.slice(0,half).map((r,i)=>[r.entry.id,rest[i+half].entry.id]),bye:bye?.entry.id||null};}
  const memo=new Map(),bits=rest.map((_,i)=>1n<<BigInt(i));
  const allowed=rest.map(a=>rest.map(b=>a!==b&&!seen.has(key(a.entry.id,b.entry.id))));
  const costs=rest.map(a=>rest.map(b=>{
   const direction=Math.sign(a.points-b.points);
   const floats=direction?state.matches.filter(m=>m.round<round&&((m.a===a.entry.id&&m.floatA===direction)||(m.b===a.entry.id&&m.floatB===direction)||(m.a===b.entry.id&&m.floatA===-direction)||(m.b===b.entry.id&&m.floatB===-direction))).length:0;
   return [Math.abs(a.points-b.points),floats,Math.abs(rank.get(a.entry.id)-rank.get(b.entry.id))];
  }));
  if(rest.length>18){
   // Encode the lexicographic sum. Each base exceeds the entire possible
   // lower-priority sum, so a lower-priority improvement cannot win a tie early.
   const base=rest.length*rest.length+1;
   const edges=[];
   for(let i=0;i<rest.length;i++)for(let j=i+1;j<rest.length;j++)if(allowed[i][j]){
    const [gap,floats,seedGap]=costs[i][j];
    edges.push([i,j,-(gap*base*base+floats*base+seedGap)]);
   }
   const mates=blossom(edges,true);
   if(mates.length!==rest.length||mates.includes(-1))continue;
   const pairs=mates.flatMap((j,i)=>i<j?[[rest[i].entry.id,rest[j].entry.id]]:[]);
   return {pairs:[...locked.map(m=>[m.a,m.b]),...pairs],bye:bye?.entry.id||null};
  }
  function solve(mask){
   if(mask===0n)return {cost:[0,0,0],pairs:[]};
   if(memo.has(mask))return memo.get(mask);
   // Choose the most constrained vertex first; still examine all possible matchings.
   let first=-1,options=[];
   for(let i=0;i<rest.length;i++)if(mask&bits[i]){
    const available=[];for(let j=0;j<rest.length;j++)if((mask&bits[j])&&allowed[i][j])available.push(j);
    if(first===-1||available.length<options.length){first=i;options=available;}
   }
   let best=null;
   for(const j of options){
    const a=rest[first],b=rest[j],tail=solve(mask^bits[first]^bits[j]);if(!tail)continue;
    const cost=addCost(tail.cost,costs[first][j]);
    if(!best||compareCost(cost,best.cost)<0)best={cost,pairs:[[a.entry.id,b.entry.id],...tail.pairs]};
   }
   memo.set(mask,best);return best;
  }
  const best=solve((1n<<BigInt(rest.length))-1n),byeId=bye?.entry.id||null;
  if(!best)continue;
  let matched=canContinue(best.pairs,byeId)?best:null;
  if(!matched)for(const pairing of perfectPairs(rest.map((_,i)=>i),(i,j)=>allowed[i][j])){
   const cost=pairing.reduce((total,[i,j])=>addCost(total,costs[i][j]),[0,0,0]);
   if(matched&&compareCost(cost,matched.cost)>=0)continue;
   const pairs=pairing.map(([i,j])=>[rest[i].entry.id,rest[j].entry.id]);
   if(canContinue(pairs,byeId))matched={pairs,cost};
  }
  if(matched)return {pairs:[...locked.map(m=>[m.a,m.b]),...matched.pairs],bye:byeId};
 }
 fail('Невозможно сформировать тур без повторных соперников и повторного пропуска. Опубликованные встречи сохранены.');
}
function draw(state,category,round,options={}){
 const entries=drawOrder(state,category),swiss=schemeOf(state,category)==='swiss';
 if(entries.length<2)fail('В разряде недостаточно участников.');
 if(round>roundCount(state,category))fail('Все туры уже сформированы.');
 const pairs=swiss?swissPairs(state,category,round,options):{pairs:B.circlePairs(entries,round),bye:null};
 const points=options.points||new Map(C.standings(state,category).map(r=>[r.entry.id,r.points]));
 return {category,round,matches:pairs.pairs.map(([a,b],i)=>({id:category+'-'+round+'-'+i,category,round,a,b,status:'queued',pinned:false,floatA:Math.sign(points.get(a)-points.get(b)),floatB:Math.sign(points.get(b)-points.get(a))})),
  bye:pairs.bye?{id:'bye-'+category+'-'+round,entryId:pairs.bye,category,round}:null};
}
function publish(state,proposal){
 if(state.closed)fail('День завершён. Сначала откройте его для исправления.');
 if((state.partialRounds||[]).some(p=>p.category===proposal.category))fail('Досрочный тур дополняется автоматически.');
 if(state.matches.some(m=>m.category===proposal.category&&m.round===proposal.round))fail('Этот тур уже опубликован.');
 if(proposal.round!==Math.max(0,...state.matches.filter(m=>m.category===proposal.category).map(m=>m.round))+1)fail('Туры публикуются по порядку.');
 if(state.matches.some(m=>m.category===proposal.category&&m.round<proposal.round&&m.status!=='done'))fail('Завершите предыдущий тур.');
 const actual=draw(state,proposal.category,proposal.round);
 if(JSON.stringify(actual)!==JSON.stringify(proposal))fail('Результаты изменились. Откройте жеребьёвку заново.');
 state.matches.push(...actual.matches);if(actual.bye)state.byes.push(actual.bye);
}
function start(state,now=Date.now()){
 if(state.started)fail('Турнир уже начат.');validate(state,{ready:true});
 state.drawOrders={};state.groupLots={};
 for(const cat of state.categories){
  const order=drawOrder(state,cat.id);
  state.drawOrders[cat.id]=order;
  if(isBracket(state,cat.id)){
   if(cat.scheme==='groups')state.groupLots[cat.id]=shuffle(order.slice());
   refreshBracket(state,cat.id);
   continue;
  }
  const rounds=schemeOf(state,cat.id)==='circle'?roundCount(state,cat.id):1;
  for(let round=1;round<=rounds;round++){
   const proposal=draw(state,cat.id,round);
   state.matches.push(...proposal.matches);if(proposal.bye)state.byes.push(proposal.bye);
  }
 }
 state.started=true;state.startedAt=now;return validate(state);
}
function redraw(state,category){
 if((state.partialRounds||[]).some(p=>p.category===category))fail('Досрочный тур пересчитывается автоматически после результата.');
 const round=Math.max(...state.matches.filter(m=>m.category===category).map(m=>m.round));
 const target=state.matches.filter(m=>m.category===category&&m.round===round);
 if(target.some(m=>m.status!=='queued')||schemeOf(state,category)!=='swiss')fail('Начавшийся тур нельзя жеребить заново.');
 state.matches=state.matches.filter(m=>!target.includes(m));state.byes=state.byes.filter(b=>b.category!==category||b.round!==round);
 publish(state,draw(state,category,round));
}
function finish(state,matchId,scores,now=Date.now()){
 if(state.closed)fail('Откройте завершённый день для исправления.');
 const match=state.matches.find(m=>m.id===matchId),correcting=match?.status==='done',oldWinner=correcting?C.matchResult(state,match).winner:null;
 if(match&&isBracket(state,match.category)){
  const next=structuredClone(state);
  C.finish(next,matchId,scores,now);
  refreshBracket(next,match.category);
  state.matches=next.matches;state.history=next.history;
  return {redraw:null};
 }
 const result=C.finish(state,matchId,scores,now);
 // A corrected earlier score can invalidate uncalled early pairs. Keep every
 // started/finished game; the scheduler proves new pairs against those locks.
 const partial=(state.partialRounds||[]).find(p=>p.category===match.category&&p.round>match.round);
 if(correcting&&partial&&oldWinner!==result.winner){state.matches=state.matches.filter(m=>m.category!==partial.category||m.round!==partial.round||m.status!=='queued');return {redraw:null,recheck:true};}
 if(partial)return {redraw:null};
 const next=state.matches.filter(m=>m.category===match.category&&m.round>match.round);
 return {redraw:correcting&&next.length>0&&next.every(m=>m.status==='queued')&&schemeOf(state,match.category)==='swiss'?match.category:null};
}
function circleStandings(state,category){
 const rows=C.standings(state,category),done=state.matches.filter(m=>m.category===category&&m.status==='done');
 const points=[...new Set(rows.map(r=>r.points))].sort((a,b)=>b-a);let place=1;
 return points.flatMap(points=>{
  const group=rows.filter(r=>r.points===points),ids=new Set(group.map(r=>r.entry.id));
  for(const row of group){
   row.personalPoints=0;row.personalSets=0;row.personalBalls=0;
   for(const m of done.filter(m=>ids.has(m.a)&&ids.has(m.b)&&[m.a,m.b].includes(row.entry.id))){
    const side=m.a===row.entry.id?0:1,result=C.matchResult(state,m);
    row.personalPoints+=result.winner===side?1:0;row.personalSets+=result.wins[side]-result.wins[1-side];
    row.personalBalls+=m.scores.reduce((sum,g)=>sum+g[side]-g[1-side],0);
   }
   row.circleCriteria=[row.personalPoints,row.personalSets,row.personalBalls,row.setsFor-row.setsAgainst,row.ballFor-row.ballAgainst,-C.rating(row.entry)];
  }
  group.sort((a,b)=>compareCost(b.circleCriteria,a.circleCriteria));
  let index=0;while(index<group.length){let end=index+1;while(end<group.length&&compareCost(group[index].circleCriteria,group[end].circleCriteria)===0)end++;
   for(let i=index;i<end;i++){group[i].place=place+index;group[i].tied=end-index>1;group[i].tieSize=end-index;}index=end;
  }
  place+=group.length;return group;
 });
}
function standings(state,category){
 const scheme=schemeOf(state,category);
 if(scheme==='swiss')return C.standings(state,category);
 if(!state.started||!isBracket(state,category))return circleStandings(state,category);
 const context=bracketContext(state,category),placements=new Map(),advancing=new Set();
 for(const bracket of context.brackets){
  for(const p of bracket.places){const id=context.resolve(p.ref);if(id)placements.set(id,p);}
  for(const node of bracket.nodes)for(const slot of [node.a,node.b]){const id=context.resolve(slot);if(id)advancing.add(id);}
 }
 const omitted=new Set(context.leads.flatMap(group=>group||[]).filter(id=>!advancing.has(id)&&!placements.has(id)));
 const nextPlace=context.brackets.at(-1).last+1;
 const rows=C.standings(state,category);
 for(const row of rows){
  const placement=placements.get(row.entry.id);
  row.tied=placement?.tied||(omitted.has(row.entry.id)&&omitted.size>1);
  row.place=placement?.place??(omitted.has(row.entry.id)?nextPlace:null);
 }
 return rows.sort((a,b)=>(a.place??Infinity)-(b.place??Infinity));
}
const api={divisions,seedModes,newDay,parseRentalDuration,rentalDuration,validate,schemeOf,isBracket,bracketContext,groupStandings,totalMatches,seeded,seedLabels,preparedOrder,prepareDraw,setSeedMode,clearDraw,swapDraw,pruneDraws,drawOrder,roundCount,roundStatus,draw,publish,start,redraw,finish,standings};
root.SwissCourtTournament=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
