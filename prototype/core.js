(function(root){
'use strict';
const categories=[
 {id:'xd',name:'Смешанный парный',short:'Микст',code:'XD',color:'green',doubles:true,rounds:5},
 {id:'md',name:'Мужской парный',short:'Мужские пары',code:'MD',color:'blue',doubles:true,rounds:5},
 {id:'ws',name:'Женский одиночный',short:'Женский одиночный',code:'WS',color:'purple',doubles:false,rounds:5}
];
const names={
 xd:[['Алексей Соколов','Мария Волкова'],['Дмитрий Орлов','Анна Белова'],['Андрей Лебедев','Елена Морозова'],['Илья Новиков','Ольга Соколова'],['Михаил Козлов','Дарья Фомина'],['Павел Павлов','Алина Зайцева'],['Игорь Смирнов','Вера Крылова'],['Никита Петров','Ирина Васильева'],['Роман Попов','Юлия Кузнецова'],['Сергей Егоров','Екатерина Никитина'],['Денис Макаров','Наталья Романова'],['Вадим Захаров','Татьяна Власова']],
 md:[['Артём Иванов','Максим Фёдоров'],['Кирилл Захаров','Олег Тихонов'],['Антон Громов','Виктор Белов'],['Глеб Михайлов','Лев Алексеев'],['Тимур Ким','Давид Мельников'],['Борис Савельев','Юрий Марков'],['Филипп Осипов','Матвей Крылов'],['Руслан Кузьмин','Василий Поляков']],
 ws:[['Анастасия Титова'],['Софья Гусева'],['Ксения Миронова'],['Полина Седова'],['Евгения Карпова'],['Валерия Котова']]
};
function roundRobin(ids,round=1){
 const list=ids.slice();if(list.length%2)list.push(null);
 for(let r=1;r<round;r++)list.splice(1,0,list.pop());
 const pairs=[];for(let i=0;i<list.length/2;i++){const a=list[i],b=list[list.length-1-i];if(a&&b)pairs.push([a,b]);}return pairs;
}
function firstPairs(entries){const sorted=entries.slice().sort((a,b)=>rating(b)-rating(a));if(sorted.length<7)return roundRobin(sorted.map(e=>e.id));const out=[];const half=Math.floor(sorted.length/2);for(let i=0;i<half;i++)out.push([sorted[i].id,sorted[i+half].id]);return out;}
function rating(entry){return entry.players.reduce((sum,p)=>sum+Number(p.rating),0)/entry.players.length;}
function seed(mode='live',now=Date.now()){
 const state={version:1,started:mode==='live',settings:{title:'Клубная лига',venue:'Бадминтонный центр «Волан»',date:'2026-11-11',start:'10:00',end:'16:00',courts:4,level:'Любительский дивизион',prepareCount:4},categories:JSON.parse(JSON.stringify(categories)),entries:[],matches:[],history:[]};
 for(const cat of categories)names[cat.id].forEach((players,i)=>state.entries.push({id:cat.id+(i+1),category:cat.id,players:players.map((name,j)=>({name,rating:1800-i*43-j*71}))}));
 if(mode==='prep')return state;
 let sequence=1;
 const make=(cat,a,b,round,status,extra={})=>({id:'m'+sequence++,category:cat,a,b,round,status,pinned:false,...extra});
 for(const cat of categories){
  const entries=state.entries.filter(e=>e.category===cat.id);
  firstPairs(entries).forEach(([a,b],i)=>state.matches.push(make(cat.id,a,b,1,'done',{scores:i%3===0?[[21,17],[18,21],[21,16]]:[[21,14+i],[21,16]],endedAt:now-(45-i*4)*60000})));
  const ids=entries.map(e=>e.id);
  if(cat.id==='ws'){
   roundRobin(ids,2).forEach(([a,b],i)=>state.matches.push(make(cat.id,a,b,2,'done',{scores:[[21,16],[21,18]],endedAt:now-(25-i*9)*60000})));
   roundRobin(ids,3).forEach(([a,b])=>state.matches.push(make(cat.id,a,b,3,'queued')));
  }else{
   const pairs=cat.id==='xd'?[[0,1],[2,3],[4,5],[6,7],[8,9],[10,11]]:[[0,1],[2,3],[4,5],[6,7]];
   pairs.forEach(([a,b],i)=>{const active=cat.id==='xd'?i<2:i===0;state.matches.push(make(cat.id,ids[a],ids[b],2,active?'playing':'queued',active?{court:cat.id==='xd'?i+1:3,startedAt:now-(cat.id==='xd'?(18-i*7):7)*60000}:{}));});
  }
 }
 // Make one ready-to-play match visibly subject to the soft rest threshold.
 const waiting=state.matches.find(m=>m.category==='md'&&m.status==='queued');
 state.matches.filter(m=>m.status==='done'&&[m.a,m.b].includes(waiting.a)).forEach(m=>m.endedAt=now-8*60000);
 return state;
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
 const previous=state.matches.filter(m=>m.status==='done'&&m.id!==match.id&&[m.a,m.b].some(id=>id===match.a||id===match.b)).map(m=>m.endedAt);
 return previous.length?Math.max(0,Math.floor((now-Math.max(...previous))/60000)):null;
}
function queue(state,now=Date.now()){
 const occupied=new Set(state.matches.filter(m=>m.status==='playing').flatMap(m=>[m.a,m.b]));
 return state.matches.filter(m=>m.status==='queued'&&!occupied.has(m.a)&&!occupied.has(m.b)).sort((a,b)=>Number(restMinutes(state,a,now)!==null&&restMinutes(state,a,now)<15)-Number(restMinutes(state,b,now)!==null&&restMinutes(state,b,now)<15));
}
function assign(state,id,court,now=Date.now()){
 const match=state.matches.find(m=>m.id===id);if(!match||match.status!=='queued')throw Error('Встреча уже изменилась. Обновите список.');
 if(!Number.isInteger(court)||court<1||court>state.settings.courts)throw Error('Выберите существующий корт.');
 if(state.matches.some(m=>m.status==='playing'&&(m.court===court||[m.a,m.b].some(p=>p===match.a||p===match.b))))throw Error('Корт или участник уже занят.');
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
function standings(state,category){
 const rows=state.entries.filter(e=>e.category===category).map(e=>({entry:e,played:0,wins:0,losses:0,points:0,setsFor:0,setsAgainst:0,ballFor:0,ballAgainst:0,buchholz:0,berger:0}));
 const map=new Map(rows.map(r=>[r.entry.id,r]));
 const done=state.matches.filter(m=>m.category===category&&m.status==='done');
 for(const m of done){const result=validateScores(m.scores);if(!result.ok)continue;for(let side=0;side<2;side++){const r=map.get(side===0?m.a:m.b);r.played++;r.wins+=result.winner===side?1:0;r.losses+=result.winner!==side?1:0;r.points=r.wins;r.setsFor+=result.wins[side];r.setsAgainst+=result.wins[1-side];for(const game of m.scores){r.ballFor+=game[side];r.ballAgainst+=game[1-side];}}}
 for(const m of done){const a=map.get(m.a),b=map.get(m.b),result=validateScores(m.scores);a.buchholz+=b.points;b.buchholz+=a.points;if(result.winner===0)a.berger+=b.points;else b.berger+=a.points;}
 // Shared places for equal points in the sketch; final tie-break rules remain to be agreed.
 rows.sort((a,b)=>b.points-a.points);let place=1;rows.forEach((r,i)=>{if(i===0||r.points!==rows[i-1].points)place=i+1;r.place=place;});return rows;
}
const api={categories,seed,rating,firstPairs,roundRobin,validGame,validateScores,restMinutes,queue,assign,finish,returnToQueue,standings};
root.SwissCourtCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
