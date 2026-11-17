(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const divisions=[
 {id:'ms',code:'MS',name:'Мужской одиночный',short:'Мужчины',doubles:false,rounds:5},
 {id:'ws',code:'WS',name:'Женский одиночный',short:'Женщины',doubles:false,rounds:5},
 {id:'md',code:'MD',name:'Мужской парный',short:'Мужские пары',doubles:true,rounds:5},
 {id:'wd',code:'WD',name:'Женский парный',short:'Женские пары',doubles:true,rounds:5},
 {id:'xd',code:'XD',name:'Смешанный парный',short:'Микст',doubles:true,rounds:5}
];
const fail=message=>{throw Error(message);};
const key=(a,b)=>[a,b].sort().join('|');
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const id=()=>globalThis.crypto.randomUUID();
function newDay(now=new Date()){
 const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
 return {version:1,kind:'tournament',id:id(),revision:0,started:false,closed:false,
  settings:{title:'Клубный турнир',venue:'Юг-Арена',date:local,start:'10:00',end:'13:00',courts:7,level:'Любительский',prepareCount:4},
  categories:structuredClone(divisions.filter(c=>['md','wd'].includes(c.id))),entries:[],matches:[],byes:[],history:[]};
}
function validate(state,{ready=false}={}){
 if(!state||state.version!==1||state.kind!=='tournament'||!safeId(state.id)||!Number.isInteger(state.revision)||state.revision<0)fail('Неверный формат игрового дня.');
 if(typeof state.started!=='boolean'||typeof state.closed!=='boolean')fail('Неверное состояние турнира.');
 const s=state.settings;
 if(!s||!Number.isInteger(s.courts)||s.courts<1||s.courts>32||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^\d{2}:\d{2}$/.test(s.start)||!/^\d{2}:\d{2}$/.test(s.end)||s.end<=s.start)fail('Проверьте дату, время и количество кортов.');
 if(!Number.isFinite(Date.parse(s.date+'T12:00:00Z'))||new Date(s.date+'T12:00:00Z').toISOString().slice(0,10)!==s.date||![s.start,s.end].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))fail('Неверная дата или время.');
 for(const name of ['title','venue','level'])if(typeof s[name]!=='string'||!s[name].trim()||s[name].length>100)fail('Заполните название, зал и дивизион.');
 if(!Array.isArray(state.categories)||state.categories.length<1||state.categories.length>3||new Set(state.categories.map(c=>c.id)).size!==state.categories.length)fail('Выберите от одного до трёх разных разрядов.');
 for(const cat of state.categories){const known=divisions.find(c=>c.id===cat.id);if(!known||cat.code!==known.code||cat.doubles!==known.doubles||![4,5].includes(cat.rounds))fail('Проверьте параметры разрядов.');}
 if(!Array.isArray(state.entries)||!Array.isArray(state.matches)||!Array.isArray(state.byes)||!Array.isArray(state.history))fail('Повреждены данные турнира.');
 const partials=state.partialRounds||[];
 if(!Array.isArray(partials)||new Set(partials.map(p=>p.category)).size!==partials.length||partials.some(p=>!state.categories.some(c=>c.id===p.category)||!Number.isInteger(p.round)||p.round<2||p.round>roundCount(state,p.category)||state.entries.filter(e=>e.category===p.category).length<7))fail('Неверные данные частично сформированного тура.');
 const ids=new Set(),players=new Set();
 for(const entry of state.entries){
  const category=state.categories.find(c=>c.id===entry.category);
  if(!category||!safeId(entry.id)||ids.has(entry.id)||!Array.isArray(entry.players)||entry.players.length!==(category.doubles?2:1))fail('Проверьте состав участников.');ids.add(entry.id);
  for(const p of entry.players){
   if(typeof p.name!=='string'||p.name.trim().split(/\s+/).length<2||p.name.length>160)fail('Нужны фамилия и имя каждого игрока.');
   const identity=p.sourceId?'source:'+p.sourceId:C.normalizeName(p.name);
   const name=C.normalizeName(p.name);
   if(players.has(identity)||players.has(name))fail('Игрок '+C.playerFullName(p)+' уже есть в игровом дне.');players.add(identity);players.add(name);
   if(p.rating!==null&&(!Number.isFinite(p.rating)||p.rating<0||p.rating>99999))fail('Рейтинг должен быть числом от 0 до 99999.');
   if((ready||state.started)&&p.rating===null)fail('Заполните рейтинг: '+C.playerFullName(p)+'.');
   for(const part of ['surname','givenName','sourceId'])if(p[part]!==undefined&&(typeof p[part]!=='string'||p[part].length>200))fail('Неверные данные игрока.');
  }
 }
 for(const cat of state.categories){
  const n=state.entries.filter(e=>e.category===cat.id).length;
  if((ready||state.started)&&n<2)fail(cat.code+': нужно не меньше двух участников / пар.');
 }
 const seenIds=new Set(),seenRounds=new Set(),seenPairs=new Set(),occupied=new Set(),active=new Set();
 for(const m of state.matches){
  if(!safeId(m.id)||typeof m.pinned!=='boolean'||seenIds.has(m.id)||!ids.has(m.a)||!ids.has(m.b)||m.a===m.b||!Number.isInteger(m.round)||m.round<1||!['queued','playing','done'].includes(m.status))fail('Повреждена встреча.');seenIds.add(m.id);
  if([m.a,m.b].some(eid=>state.entries.find(e=>e.id===eid).category!==m.category))fail('Встреча смешивает разряды.');
  const pair=key(m.a,m.b);if(seenPairs.has(pair))fail('Повторные соперники в основных турах.');seenPairs.add(pair);
  for(const eid of [m.a,m.b]){const rk=eid+':'+m.round;if(seenRounds.has(rk))fail('Две встречи участника в одном туре.');seenRounds.add(rk);}
  if(m.status==='playing'){
   if(!Number.isInteger(m.court)||m.court<1||m.court>s.courts||occupied.has(m.court)||!Number.isFinite(m.startedAt))fail('Конфликт или неверный номер корта.');occupied.add(m.court);
   for(const eid of [m.a,m.b]){if(active.has(eid))fail('Игрок уже на другом корте.');active.add(eid);}
  }
  if(m.status==='done'&&(!Array.isArray(m.scores)||m.scores.some(g=>!Array.isArray(g)||g.length!==2||g.some(v=>!Number.isInteger(v)))||!C.validateScores(m.scores).ok||!Number.isFinite(m.endedAt)))fail('Неверный результат встречи.');
 }
 const byeEntries=new Set();
 for(const bye of state.byes){
  const e=state.entries.find(e=>e.id===bye.entryId),rk=bye.entryId+':'+bye.round;
  if(!safeId(bye.id)||!e||e.category!==bye.category||!Number.isInteger(bye.round)||bye.round<1||!state.matches.some(m=>m.category===bye.category&&m.round===bye.round)||seenRounds.has(rk)||byeEntries.has(e.id))fail('Неверный или повторный пропуск тура.');
  seenRounds.add(rk);byeEntries.add(e.id);
 }
 for(const h of state.history)if(!seenIds.has(h.matchId)||!Number.isFinite(h.at)||!Array.isArray(h.old)||!Array.isArray(h.new)||!C.validateScores(h.old).ok||!C.validateScores(h.new).ok)fail('Повреждена история исправлений.');
 if(!state.started&&(state.matches.length||state.byes.length||partials.length))fail('Незапущенный день содержит встречи.');
 if(state.started)for(const cat of state.categories){
  const n=state.entries.filter(e=>e.category===cat.id).length,matches=state.matches.filter(m=>m.category===cat.id),partial=partials.find(p=>p.category===cat.id),rounds=Math.max(partial?.round||0,...matches.map(m=>m.round));
  if(rounds<1||rounds>roundCount(state,cat.id))fail('Неверное число опубликованных туров.');
  if(partial&&partial.round!==rounds)fail('Только последний тур может быть сформирован частично.');
  for(let r=1;r<=rounds;r++){
   const current=matches.filter(m=>m.round===r),isPartial=partial?.round===r;
   if(isPartial?(current.length>Math.floor(n/2)||current.some(m=>m.early!==true)):current.length!==Math.floor(n/2))fail('В туре отсутствуют встречи.');
   if(state.byes.filter(b=>b.category===cat.id&&b.round===r).length!==(n>=7&&!isPartial?n%2:0))fail('Неверные пропуски тура.');
   for(const m of current.filter(m=>m.status!=='queued'))if(matches.some(previous=>previous.round<r&&previous.status!=='done'&&[previous.a,previous.b].some(eid=>[m.a,m.b].includes(eid))))fail('Пара ещё не завершила свою предыдущую встречу.');
  }
 }
 if(state.closed&&(!state.started||!state.categories.every(c=>roundStatus(state,c.id).complete)))fail('День ещё не завершён.');
 return state;
}
function seeded(state,category){
 return state.entries.filter(e=>e.category===category).slice().sort((a,b)=>C.rating(b)-C.rating(a)||C.entryLabel(state,a.id).localeCompare(C.entryLabel(state,b.id),'ru')||a.id.localeCompare(b.id));
}
function roundCount(state,category){const n=state.entries.filter(e=>e.category===category).length;return n<7?n-1+n%2:state.categories.find(c=>c.id===category).rounds;}
function roundStatus(state,category){
 const matches=state.matches.filter(m=>m.category===category),partial=(state.partialRounds||[]).find(p=>p.category===category),round=Math.max(partial?.round||0,...matches.map(m=>m.round));
 const totalRounds=roundCount(state,category),pending=matches.some(m=>m.status!=='done');
 return {round,totalRounds,pending,partial:!!partial,complete:state.started&&round>=totalRounds&&!pending&&!partial,canDraw:state.started&&!state.closed&&!pending&&!partial&&round<totalRounds};
}
const addCost=(a,b)=>a.map((v,i)=>v+b[i]);
const compareCost=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
function swissPairs(state,category,round,{locked=[],points=null}={}){
 const entries=seeded(state,category),rank=new Map(entries.map((e,i)=>[e.id,i]));
 const rows=(points?entries.map(entry=>({entry,points:points.get(entry.id)})):C.standings(state,category)).sort((a,b)=>b.points-a.points||rank.get(a.entry.id)-rank.get(b.entry.id));
 const lockedIds=new Set(locked.flatMap(m=>[m.a,m.b]));
 const seen=new Set(state.matches.map(m=>key(m.a,m.b)));
 const candidates=rows.length%2?rows.filter(r=>!lockedIds.has(r.entry.id)&&!state.byes.some(b=>b.entryId===r.entry.id)).slice().reverse():[null];
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
  const matched=solve((1n<<BigInt(rest.length))-1n);
  if(matched)return {pairs:[...locked.map(m=>[m.a,m.b]),...matched.pairs],bye:bye?.entry.id||null};
 }
 fail('Невозможно сформировать тур без повторных соперников и повторного пропуска. Опубликованные встречи сохранены.');
}
function draw(state,category,round,options={}){
 const entries=seeded(state,category),swiss=entries.length>=7;
 if(entries.length<2)fail('В разряде недостаточно участников.');
 if(round>roundCount(state,category))fail('Все туры уже сформированы.');
 const pairs=swiss?swissPairs(state,category,round,options):{pairs:C.roundRobin(entries.map(e=>e.id),round),bye:null};
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
function start(state){
 if(state.started)fail('Турнир уже начат.');validate(state,{ready:true});
 for(const cat of state.categories){
  const entries=seeded(state,cat.id),rounds=entries.length<7?roundCount(state,cat.id):1;
  for(let round=1;round<=rounds;round++){
   const proposal=draw(state,cat.id,round);state.matches.push(...proposal.matches);if(proposal.bye)state.byes.push(proposal.bye);
  }
 }
 state.started=true;return validate(state);
}
function redraw(state,category){
 if((state.partialRounds||[]).some(p=>p.category===category))fail('Досрочный тур пересчитывается автоматически после результата.');
 const round=Math.max(...state.matches.filter(m=>m.category===category).map(m=>m.round));
 const target=state.matches.filter(m=>m.category===category&&m.round===round);
 if(target.some(m=>m.status!=='queued')||seeded(state,category).length<7)fail('Начавшийся тур нельзя жеребить заново.');
 state.matches=state.matches.filter(m=>!target.includes(m));state.byes=state.byes.filter(b=>b.category!==category||b.round!==round);
 publish(state,draw(state,category,round));
}
function finish(state,matchId,scores,now=Date.now()){
 if(state.closed)fail('Откройте завершённый день для исправления.');
 const match=state.matches.find(m=>m.id===matchId),correcting=match?.status==='done',oldWinner=correcting?C.validateScores(match.scores).winner:null;
 C.finish(state,matchId,scores,now);
 // A corrected earlier score can invalidate uncalled early pairs. Keep every
 // started/finished game; the scheduler proves new pairs against those locks.
 const partial=(state.partialRounds||[]).find(p=>p.category===match.category&&p.round>match.round);
 if(correcting&&partial&&oldWinner!==C.validateScores(scores).winner){state.matches=state.matches.filter(m=>m.category!==partial.category||m.round!==partial.round||m.status!=='queued');return {redraw:null,recheck:true};}
 if(partial)return {redraw:null};
 const next=state.matches.filter(m=>m.category===match.category&&m.round>match.round);
 return {redraw:correcting&&next.length>0&&next.every(m=>m.status==='queued')&&seeded(state,match.category).length>=7?match.category:null};
}
function circleStandings(state,category){
 const rows=C.standings(state,category),done=state.matches.filter(m=>m.category===category&&m.status==='done');
 const points=[...new Set(rows.map(r=>r.points))].sort((a,b)=>b-a);let place=1;
 return points.flatMap(points=>{
  const group=rows.filter(r=>r.points===points),ids=new Set(group.map(r=>r.entry.id));
  for(const row of group){
   row.personalPoints=0;row.personalSets=0;row.personalBalls=0;
   for(const m of done.filter(m=>ids.has(m.a)&&ids.has(m.b)&&[m.a,m.b].includes(row.entry.id))){
    const side=m.a===row.entry.id?0:1,result=C.validateScores(m.scores);
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
function standings(state,category){return seeded(state,category).length<7?circleStandings(state,category):C.standings(state,category);}
const api={divisions,newDay,validate,seeded,roundCount,roundStatus,draw,publish,start,redraw,finish,standings};
root.SwissCourtTournament=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
