(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const minute=60000,limitMinutes=150,speed=10;
function random(seed){
 let value=seed>>>0;
 return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
}
function shuffle(items,rng){
 const result=items.slice();
 for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
function pairRound(state,category,round,rng){
 const rows=C.standings(state,category).sort((a,b)=>b.points-a.points||C.rating(b.entry)-C.rating(a.entry));
 const seen=new Set(state.matches.map(m=>[m.a,m.b].sort().join('/')));
 let bye=null;
 if(rows.length%2){
  const candidates=rows.filter(row=>!(state.byes||[]).some(b=>b.entryId===row.entry.id));
  bye=candidates.at(-1).entry.id;
  rows.splice(rows.findIndex(row=>row.entry.id===bye),1);
 }
 if(round===1){
  const half=rows.length/2;
  return {bye,pairs:rows.slice(0,half).map((row,i)=>[row.entry.id,rows[i+half].entry.id])};
 }
 // Demo Swiss pairing: minimize point differences, without repeated opponents.
 let best=null,bestCost=Infinity;
 function visit(rest,pairs,cost){
  if(cost>=bestCost)return;
  if(!rest.length){best=pairs;bestCost=cost;return;}
  const first=rest[0];
  const candidates=rest.slice(1).map((row,index)=>({row,index:index+1,tie:rng()}))
   .sort((a,b)=>Math.abs(first.points-a.row.points)-Math.abs(first.points-b.row.points)||a.tie-b.tie);
  for(const {row,index} of candidates){
   if(seen.has([first.entry.id,row.entry.id].sort().join('/')))continue;
   visit(rest.filter((_,i)=>i!==0&&i!==index),[...pairs,[first.entry.id,row.entry.id]],cost+Math.abs(first.points-row.points)*100+index);
  }
 }
 visit(rows,[],0);
 if(!best)throw Error('Не удалось подобрать демонстрационные пары без повторов.');
 return {bye,pairs:best};
}
function createPlan({date='2026-11-17',seed=17}={}){
 const startsAt=Date.parse(date+'T10:00:00+03:00'),state=C.seed('prep',startsAt);
 state.started=true;state.entries=state.entries.filter(e=>Number(e.id.slice(2))<=(e.category==='md'?8:9));
 state.categories.forEach(c=>c.rounds=4);
 Object.assign(state.settings,{title:'Юг-Арена · MD / WD',venue:'Юг-Арена',date,start:'10:00',end:'12:30',courts:7,prepareCount:4});
 state.byes=[];
 const initial=structuredClone(state),rng=random(seed),events=[],rounds={md:0,wd:0},plannedByes=[];
 const durations=shuffle(Array.from({length:4},()=>[18,20,21,19,22,20,21,19]).flat(),rng);
 let durationIndex=0,now=startsAt,sequence=0;
 function draw(category){
  const round=++rounds[category],drawn=pairRound(state,category,round,rng);
  const matches=drawn.pairs.map(([a,b])=>({id:'sim-'+(++sequence),category,a,b,round,status:'queued',pinned:false,drawnAt:now}));
  state.matches.push(...matches);
  const bye=drawn.bye?{id:'bye-'+category+'-'+round,entryId:drawn.bye,category,round,drawnAt:now}:null;
  if(bye)plannedByes.push(bye);
  events.push({at:now,type:'draw',category,round,matches:structuredClone(matches),bye:bye?structuredClone(bye):null});
 }
 function scoresFor(duration){
  const firstWins=rng()<.56;
  const loser=()=>11+Math.floor(rng()*9);
  let scores=duration>=21?[[21,loser()],[loser(),21],[21,loser()]]:[[21,loser()],[21,loser()]];
  if(!firstWins)scores=scores.map(game=>game.slice().reverse());
  return scores;
 }
 function readyAt(match){
  return Math.max(match.drawnAt,...[match.a,match.b].map(id=>{
   const last=C.entryActivity(state,id,now).lastEndedAt;
   return last===null?match.drawnAt:last+15*minute;
  }));
 }
 state.categories.forEach(c=>draw(c.id));
 while(state.matches.some(m=>m.status!=='done')||Object.values(rounds).some(round=>round<4)){
  for(const match of state.matches.filter(m=>m.status==='playing'&&m.plannedEnd<=now)){
   const court=match.court;
   C.finish(state,match.id,match.plannedScores,now);
   events.push({at:now,type:'finish',matchId:match.id,court,scores:match.scores});
  }
  for(const category of state.categories){
   const round=rounds[category.id],matches=state.matches.filter(m=>m.category===category.id&&m.round===round);
   if(matches.every(m=>m.status==='done')){
    const bye=plannedByes.find(b=>b.category===category.id&&b.round===round&&!b.endedAt);
    if(bye){bye.endedAt=now;state.byes.push({...bye});events.push({at:now,type:'bye',bye:{...bye}});}
    if(round<4)draw(category.id);
   }
  }
  const ready=state.matches.filter(m=>m.status==='queued'&&readyAt(m)<=now)
   .sort((a,b)=>readyAt(a)-readyAt(b)||a.drawnAt-b.drawnAt||a.id.localeCompare(b.id,undefined,{numeric:true}));
  for(const match of ready){
   const court=Array.from({length:7},(_,i)=>i+1).find(n=>!state.matches.some(m=>m.status==='playing'&&m.court===n));
   if(!court)break;
   C.assign(state,match.id,court,now);
   const duration=durations[durationIndex++];
   match.plannedEnd=now+duration*minute;match.plannedScores=scoresFor(duration);
   events.push({at:now,type:'assign',matchId:match.id,court});
  }
  const next=[...state.matches.filter(m=>m.status==='playing').map(m=>m.plannedEnd),
   ...state.matches.filter(m=>m.status==='queued').map(readyAt).filter(at=>at>now)];
  if(!next.length)break;
  now=Math.min(...next);
  if(now>startsAt+300*minute)throw Error('Демонстрационное расписание не сходится.');
 }
 if(state.matches.some(m=>m.status!=='done'))throw Error('Демонстрационный турнир не завершён.');
 return {initial,events,startsAt,endsAt:startsAt+limitMinutes*minute,finishedAt:now,seed,
  matchCount:state.matches.length,averageMinutes:durations.reduce((a,b)=>a+b,0)/durations.length};
}
function snapshot(plan,elapsedMs){
 const now=plan.startsAt+Math.max(0,Math.min(limitMinutes*minute,elapsedMs));
 const state=structuredClone(plan.initial),pendingByes=[];
 for(const event of plan.events){
  if(event.at>now)break;
  if(event.type==='draw'){state.matches.push(...structuredClone(event.matches));if(event.bye)pendingByes.push({...event.bye});}
  if(event.type==='assign')C.assign(state,event.matchId,event.court,event.at);
  if(event.type==='finish')C.finish(state,event.matchId,event.scores,event.at);
  if(event.type==='bye')state.byes.push({...event.bye});
 }
 state.simulation={now,elapsedMs:now-plan.startsAt,limitMs:limitMinutes*minute,
  complete:now>=plan.finishedAt,finishedAt:plan.finishedAt,
  pendingByes:pendingByes.filter(bye=>!state.byes.some(done=>done.id===bye.id)),
  lastEvent:plan.events.filter(e=>e.at<=now&&e.type==='finish').at(-1)||null};
 return state;
}
function playbackElapsed(control,realNow=Date.now()){
 return Math.max(0,Math.min(limitMinutes*minute,control.elapsedMs+(control.paused?0:Math.max(0,realNow-control.anchorAt)*speed)));
}
const api={createPlan,snapshot,playbackElapsed,minute,limitMinutes,speed};
root.SwissCourtSimulation=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
