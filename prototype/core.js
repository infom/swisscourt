(function(root){
'use strict';
const categories=[
 {id:'md',name:'Мужской парный',short:'Мужские пары',code:'MD',color:'blue',doubles:true,rounds:5},
 {id:'wd',name:'Женский парный',short:'Женские пары',code:'WD',color:'pink',doubles:true,rounds:5}
];
const names={
 md:[['Артём Иванов','Максим Фёдоров'],['Кирилл Захаров','Олег Тихонов'],['Антон Громов','Виктор Белов'],['Глеб Михайлов','Лев Алексеев'],['Тимур Ким','Давид Мельников'],['Борис Савельев','Юрий Марков'],['Филипп Осипов','Матвей Крылов'],['Руслан Кузьмин','Василий Поляков'],['Алексей Соколов','Дмитрий Орлов'],['Андрей Лебедев','Илья Новиков'],['Михаил Козлов','Павел Павлов'],['Игорь Смирнов','Никита Петров']],
 wd:[['Мария Чернова','Анна Белова'],['Юлия Чернова','Елена Морозова'],['Ольга Соколова','Дарья Фомина'],['Алина Зайцева','Вера Крылова'],['Ирина Васильева','Юлия Кузнецова'],['Екатерина Никитина','Наталья Романова'],['Татьяна Власова','Анастасия Титова'],['Софья Гусева','Ксения Миронова'],['Полина Седова','Евгения Карпова'],['Валерия Котова','Виктория Зорина'],['Елизавета Семёнова','Диана Панова'],['Арина Назарова','Маргарита Ершова']]
};
function roundRobin(ids,round=1){
 const list=ids.slice();if(list.length%2)list.push(null);
 for(let r=1;r<round;r++)list.splice(1,0,list.pop());
 const pairs=[];for(let i=0;i<list.length/2;i++){const a=list[i],b=list[list.length-1-i];if(a&&b)pairs.push([a,b]);}return pairs;
}
function firstPairs(entries){const sorted=entries.slice().sort((a,b)=>rating(b)-rating(a));if(sorted.length<7)return roundRobin(sorted.map(e=>e.id));const out=[];const half=Math.floor(sorted.length/2);for(let i=0;i<half;i++)out.push([sorted[i].id,sorted[i+half].id]);return out;}
function rating(entry){return entry.players.reduce((sum,p)=>sum+Number(p.rating),0)/entry.players.length;}
function seed(mode='live',now=Date.now()){
 const state={version:1,started:mode==='live',settings:{title:'Клубная лига · MD / WD',venue:'Бадминтонный центр «Волан»',date:'2026-11-12',start:'10:00',end:'16:00',courts:7,level:'Любительский дивизион',prepareCount:4},categories:JSON.parse(JSON.stringify(categories)),entries:[],matches:[],history:[]};
 for(const cat of categories)names[cat.id].forEach((players,i)=>state.entries.push({id:cat.id+(i+1),category:cat.id,players:players.map((name,j)=>({name,rating:1800-i*43-j*71}))}));
 if(mode==='prep')return state;
 let sequence=1;
 const make=(cat,a,b,round,status,extra={})=>({id:'m'+sequence++,category:cat,a,b,round,status,pinned:false,...extra});
 for(const cat of categories){
  const entries=state.entries.filter(e=>e.category===cat.id);
  firstPairs(entries).forEach(([a,b],i)=>state.matches.push(make(cat.id,a,b,1,'done',{scores:i%3===0?[[21,17],[18,21],[21,16]]:[[21,14+i],[21,16]],endedAt:now-(65-i*4)*60000})));
  const ids=entries.map(e=>e.id);
  const pairs=[[0,1],[2,3],[4,5],[6,7],[8,9],[10,11]];
  const durations=cat.id==='md'?[1,24,12]:[35,18,8];
  pairs.forEach(([a,b],i)=>state.matches.push(make(cat.id,ids[a],ids[b],2,i<3?'playing':'queued',i<3?{court:(cat.id==='md'?0:3)+i+1,startedAt:now-durations[i]*60000}:{})));
 }
 // Make one ready-to-play match visibly subject to the soft rest threshold.
 const waiting=state.matches.find(m=>m.category==='md'&&m.status==='queued');
 state.matches.filter(m=>m.status==='done'&&[m.a,m.b].includes(waiting.a)).forEach(m=>m.endedAt=now-8*60000);
 ensureRoundRobinSchedule(state);
 return state;
}
function normalizeName(value){return String(value).trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');}
function playerParts(player){const parts=player.name.trim().split(/\s+/);return {surname:player.surname||parts.at(-1),givenName:player.givenName||parts[0]};}
function playerLabel(state,player){
 const {surname,givenName}=playerParts(player);
 const namesakes=new Set(state.entries.flatMap(e=>e.players).filter(p=>normalizeName(playerParts(p).surname)===normalizeName(surname)).map(p=>normalizeName(p.name)));
 return (surname+(namesakes.size>1?' '+givenName[0]:'')).toLocaleUpperCase('ru-RU');
}
function entryLabel(state,id){return state.entries.find(e=>e.id===id)?.players.map(p=>playerLabel(state,p)).join(' / ')||'—';}
function entryPlayers(state,id){return state.entries.find(e=>e.id===id)?.players.map(p=>normalizeName(p.name))||[];}
function sharedPlayers(state,first,second){const other=new Set(second.flatMap(id=>entryPlayers(state,id)));return first.flatMap(id=>entryPlayers(state,id)).filter(name=>other.has(name));}
function entryActivity(state,id,now=Date.now()){
 const playing=state.matches.find(m=>m.status==='playing'&&sharedPlayers(state,[id],[m.a,m.b]).length);
 const previous=state.matches.filter(m=>m.status==='done'&&sharedPlayers(state,[id],[m.a,m.b]).length).sort((a,b)=>b.endedAt-a.endedAt)[0];
 return {playing,lastEndedAt:previous?.endedAt??null,restMinutes:previous?Math.max(0,Math.floor((now-previous.endedAt)/60000)):null};
}
function courtTiming(minutes){return minutes<2?'called':minutes<20?'normal':minutes<30?'long':'delayed';}
function restTiming(minutes){return minutes===null?'unplayed':minutes<5?'critical':minutes<15?'short':minutes<60?'normal':minutes<90?'long':'overdue';}
function entryProgress(state,id){
 const games=state.matches.filter(m=>m.status==='done'&&(m.a===id||m.b===id))
  .slice().sort((a,b)=>a.round-b.round||a.endedAt-b.endedAt).flatMap(m=>{
   const result=validateScores(m.scores);if(!result.ok)return [];
   const side=m.a===id?0:1;
   return [{matchId:m.id,round:m.round,opponentId:side===0?m.b:m.a,won:result.winner===side,
    setsFor:result.wins[side],setsAgainst:result.wins[1-side],deciding:m.scores.length===3,
    scores:m.scores.map(game=>[game[side],game[1-side]])}];
  });
 const byes=(state.byes||[]).filter(bye=>bye.entryId===id).map(bye=>({matchId:bye.id,round:bye.round,bye:true,deciding:false}));
 return [...games,...byes].sort((a,b)=>a.round-b.round);
}
function ensureRoundRobinSchedule(state){
 if(!state.started)return;
 for(const category of state.categories){
  const entries=state.entries.filter(e=>e.category===category.id).sort((a,b)=>rating(b)-rating(a));
  if(entries.length<2||entries.length>6||entries.length%2)continue;
  for(let round=1;round<entries.length;round++){
   if(state.matches.some(m=>m.category===category.id&&m.round===round))continue;
   roundRobin(entries.map(e=>e.id),round).forEach(([a,b],i)=>state.matches.push({id:'rr-'+category.id+'-'+round+'-'+i,category:category.id,a,b,round,status:'queued',pinned:false}));
  }
 }
}
function matchAvailability(state,match){
 if(match.status!=='queued')return {available:false,blockers:[]};
 const blockers=[];
 for(const active of state.matches.filter(m=>m.status==='playing'&&m.id!==match.id)){
  const players=sharedPlayers(state,[match.a,match.b],[active.a,active.b]);
  if(players.length)blockers.push({type:'busy',court:active.court,matchId:active.id,players});
 }
 const earlier=state.matches.filter(m=>m.category===match.category&&m.round<match.round&&m.status!=='done');
 if(earlier.length){const round=Math.min(...earlier.map(m=>m.round));blockers.push({type:'round',round,remaining:earlier.filter(m=>m.round===round).length});}
 return {available:match.status==='queued'&&blockers.length===0,blockers};
}
function validGame(a,b){if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>30||b>30||a===b)return false;const high=Math.max(a,b),low=Math.min(a,b);return high===21&&low<=19||high>21&&high<30&&high-low===2||high===30&&(low===28||low===29);}
function validateScores(raw){
 const scores=[];let wins=[0,0];
 for(let i=0;i<raw.length;i++){
  const [a,b]=raw[i];if((a===''||a==null)&&(b===''||b==null))continue;
  if(wins.includes(2))return {ok:false,error:'После двух выигранных партий встреча завершена. Уберите лишнюю партию.'};
  if(a===''||b===''||a==null||b==null)return {ok:false,error:'Заполните оба значения в партии '+(i+1)+'.'};
  if(i!==scores.length)return {ok:false,error:'Заполняйте партии по порядку.'};
  const x=Number(a),y=Number(b);if(!validGame(x,y))return {ok:false,error:'Партия '+(i+1)+': до 21, после 20:20 — разница 2, предел — 30.'};
  scores.push([x,y]);wins[x>y?0:1]++;
 }
 if(!wins.includes(2))return {ok:false,error:'Для результата нужны две выигранные партии у одного участника.'};
 return {ok:true,scores,wins,winner:wins[0]===2?0:1};
}
function restMinutes(state,match,now=Date.now()){
 const previous=state.matches.filter(m=>m.status==='done'&&m.id!==match.id&&sharedPlayers(state,[match.a,match.b],[m.a,m.b]).length).map(m=>m.endedAt);
 return previous.length?Math.max(0,Math.floor((now-Math.max(...previous))/60000)):null;
}
function queue(state,now=Date.now()){
 return state.matches.filter(m=>m.status==='queued'&&matchAvailability(state,m).available).sort((a,b)=>Number(restMinutes(state,a,now)!==null&&restMinutes(state,a,now)<15)-Number(restMinutes(state,b,now)!==null&&restMinutes(state,b,now)<15));
}
function queueItems(state,now=Date.now()){
 const ready=queue(state,now);
 return [...ready,...state.matches.filter(m=>m.status==='queued'&&!matchAvailability(state,m).available).sort((a,b)=>a.round-b.round)];
}
function nextForEntry(state,id,now=Date.now(),orderedMatches=queueItems(state,now)){
 const activity=entryActivity(state,id,now);
 if(activity.playing)return {kind:'playing',match:activity.playing,activity};
 const match=orderedMatches.filter(m=>sharedPlayers(state,[id],[m.a,m.b]).length).sort((a,b)=>a.round-b.round)[0];
 if(match){const availability=matchAvailability(state,match);return {kind:availability.available?'queued':'blocked',match,activity,availability,position:availability.available?orderedMatches.findIndex(m=>m.id===match.id)+1:0};}
 return {kind:state.started?'waiting':'preparation',activity};
}
function assign(state,id,court,now=Date.now()){
 const match=state.matches.find(m=>m.id===id);if(!match||match.status!=='queued')throw Error('Встреча уже изменилась. Обновите список.');
 if(!Number.isInteger(court)||court<1||court>state.settings.courts)throw Error('Выберите существующий корт.');
 if(state.matches.some(m=>m.status==='playing'&&m.court===court))throw Error('Корт уже занят.');
 if(!matchAvailability(state,match).available)throw Error('Встреча пока недоступна: игрок занят или предыдущий тур не завершён.');
 match.status='playing';match.court=court;match.startedAt=now;
}
function finish(state,id,raw,now=Date.now()){
 const match=state.matches.find(m=>m.id===id);if(!match||!['playing','done'].includes(match.status))throw Error('Для этой встречи нельзя сохранить результат.');
 const result=validateScores(raw);if(!result.ok)throw Error(result.error);
 const correction=match.status==='done';
 if(correction)state.history.unshift({matchId:id,old:match.scores,new:result.scores,at:now});
 match.scores=result.scores;match.status='done';if(!correction)match.endedAt=now;delete match.court;
 return result;
}
function returnToQueue(state,id){const match=state.matches.find(m=>m.id===id);if(!match||match.status!=='playing')throw Error('Встреча уже не находится на корте.');match.status='queued';delete match.court;delete match.startedAt;}
function rankStandings(rows,done,swiss=true){
 // Resolve whole tied groups at each step. Head-to-head is not a pairwise sort:
 // applying it inside a three-way tie would produce a non-transitive order.
 function split(groups,compare){
  return groups.flatMap(group=>{
   const sorted=group.slice().sort(compare),parts=[];
   for(const row of sorted){
    if(!parts.length||compare(parts.at(-1)[0],row)!==0)parts.push([]);
    parts.at(-1).push(row);
   }
   return parts;
  });
 }
 const descending=key=>(a,b)=>b[key]-a[key];
 let groups=split([rows],descending('points'));
 if(swiss){
  groups=split(groups,descending('buchholz'));
  groups=split(groups,descending('berger'));
  groups=groups.flatMap(group=>{
   if(group.length!==2)return [group];
   const [a,b]=group,meeting=done.filter(m=>[m.a,m.b].includes(a.entry.id)&&[m.a,m.b].includes(b.entry.id));
   if(meeting.length!==1)return [group];
   const result=validateScores(meeting[0].scores);if(!result.ok)return [group];
   const winner=result.winner===0?meeting[0].a:meeting[0].b;
   group.forEach(row=>row.headToHead=winner);
   return group[0].entry.id===winner?[[group[0]],[group[1]]]:[[group[1]],[group[0]]];
  });
  const ratio=(forKey,againstKey)=>(a,b)=>{
   const x=a[againstKey]===0?(a[forKey]>0?Infinity:0):a[forKey]/a[againstKey];
   const y=b[againstKey]===0?(b[forKey]>0?Infinity:0):b[forKey]/b[againstKey];
   return x===y?0:x>y?-1:1;
  };
  groups=split(groups,ratio('setsFor','setsAgainst'));
  groups=split(groups,ratio('ballFor','ballAgainst'));
 }
 let place=1;
 return groups.flatMap(group=>{
  group.forEach(row=>{row.place=place;row.tied=group.length>1;row.tieSize=group.length;});
  place+=group.length;return group;
 });
}
function standings(state,category){
 const rows=state.entries.filter(e=>e.category===category).map(e=>({entry:e,played:0,wins:0,losses:0,points:0,byes:0,setsFor:0,setsAgainst:0,ballFor:0,ballAgainst:0,buchholz:0,berger:0}));
 const map=new Map(rows.map(r=>[r.entry.id,r]));
 const done=state.matches.filter(m=>m.category===category&&m.status==='done'&&map.has(m.a)&&map.has(m.b)&&validateScores(m.scores).ok);
 for(const m of done){const result=validateScores(m.scores);if(!result.ok)continue;for(let side=0;side<2;side++){const r=map.get(side===0?m.a:m.b);r.played++;r.wins+=result.winner===side?1:0;r.losses+=result.winner!==side?1:0;r.points=r.wins;r.setsFor+=result.wins[side];r.setsAgainst+=result.wins[1-side];for(const game of m.scores){r.ballFor+=game[side];r.ballAgainst+=game[1-side];}}}
 // A bye grants a point without creating a game, a win or synthetic scores.
 for(const bye of state.byes||[]){const row=map.get(bye.entryId);if(row){row.points++;row.byes++;}}
 for(const m of done){const a=map.get(m.a),b=map.get(m.b),result=validateScores(m.scores);a.buchholz+=b.points;b.buchholz+=a.points;if(result.winner===0)a.berger+=b.points;else b.berger+=a.points;}
 const swiss=rows.length>=7,rounds=state.categories.find(c=>c.id===category)?.rounds||0;
 if(swiss)for(const row of rows){
  // REQUIREMENTS.md §8.5: virtual opponent for an assigned bye, V = min(S,T/2).
  row.byeOpponentPoints=row.byes*Math.min(row.points,rounds/2);
  row.buchholz+=row.byeOpponentPoints;row.berger+=row.byeOpponentPoints;
 }
 return rankStandings(rows,done,swiss);
}
const api={categories,seed,rating,firstPairs,roundRobin,validGame,validateScores,restMinutes,queue,queueItems,matchAvailability,entryActivity,entryProgress,courtTiming,restTiming,nextForEntry,normalizeName,playerParts,playerLabel,entryLabel,ensureRoundRobinSchedule,assign,finish,returnToQueue,standings,rankStandings};
root.SwissCourtCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
