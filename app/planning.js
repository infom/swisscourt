(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const B=root.SwissCourtBrackets||(typeof require==='function'?require('./brackets.js'):null);
const T=root.SwissCourtTournament||(typeof require==='function'?require('./tournament.js'):null);
const minute=60000;
const rest=15;

function realStart(state,now){
 if(Number.isFinite(state.startedAt))return state.startedAt;
 // Older tournaments did not store their launch time. The first recorded
 // match gives a better starting point than the date printed on the board.
 let earliest=Infinity;
 for(const match of state.matches){
  if(match.status==='queued')continue;
  if(Number.isFinite(match.startedAt))earliest=Math.min(earliest,match.startedAt);
  else if(Number.isFinite(match.endedAt))earliest=Math.min(earliest,match.endedAt-C.formatOf(state,match.category).minutes*minute);
 }
 return Number.isFinite(earliest)?earliest:now;
}

function tasksFor(state,cat,n){
 const ranked=T.seeded(state,cat.id);
 const order=state.drawOrders?.[cat.id]||Array.from({length:n},(_,index)=>ranked[index]?.id||cat.id+'-p'+index);
 const actual=state.matches.filter(m=>m.category===cat.id);
 const matches=new Map(actual.map(m=>[m.id,m]));
 const task=m=>({...m,...matches.get(m.id),after:[]});
 if(cat.scheme==='knockout'||cat.scheme==='groups'){
  const graph=B.layout(cat,order);
  const context=state.started?T.bracketContext(state,cat.id):null;
  const groupOrder=context?.leads||[];
  const outcomes=new Map();
  const rows=[...graph.games.map(task)];
  function resolve(ref){
   if(ref.entry)return ref.entry;
   if(ref.match)return outcomes.get(ref.match)[ref.outcome];
   return (groupOrder[ref.group]||graph.groups[ref.group])[ref.place-1];
  }
  function dependencies(ref){
   if(ref.match)return [ref.match];
   if(ref.entry)return [];
   return graph.games.filter(m=>m.group===ref.group).map(m=>m.id);
  }
  for(const bracket of graph.brackets)for(const node of bracket.nodes){
   const m=task({...node,a:resolve(node.a),b:resolve(node.b)});
   m.after=[...dependencies(node.a),...dependencies(node.b)];
   const side=m.status==='done'?C.matchResult(state,m).winner:0;
   outcomes.set(m.id,{winner:side===0?m.a:m.b,loser:side===0?m.b:m.a});
   rows.push(m);
  }
  return rows;
 }
 const rows=[];
 const rounds=cat.scheme==='swiss'?cat.rounds:n-1+n%2;
 for(let round=1;round<=rounds;round++){
  const known=actual.filter(m=>m.round===round);
  const busy=new Set(known.flatMap(m=>[m.a,m.b]));
  const remaining=order.filter(id=>!busy.has(id));
  if(rounds===0)break;
  const slots=cat.scheme==='circle'&&!known.length?C.roundRobin(order,round):
   C.roundRobin(remaining,1);
  const previous=rows.filter(m=>m.round===round-1).map(m=>m.id);
  rows.push(...known.map(task),...slots.map(([a,b],i)=>({
   id:cat.id+'-forecast-'+round+'-'+i,category:cat.id,round,a,b,after:cat.scheme==='swiss'?previous:[]
  })));
 }
 return rows;
}

function estimate(state,{actual=false,now=Date.now()}={}){
 const budget=T.rentalDuration(state.settings);
 const live=actual&&state.started;
 const origin=live?realStart(state,now):now;
 const current=live?Math.max(0,(now-origin)/minute):0;
 const stats=new Map(),tasks=[];
 for(const original of state.categories){
  const count=state.entries.filter(e=>e.category===original.id).length;
  const n=actual?count:original.planned||count||8;
  const cat=original.scheme?original:{...original,scheme:n<7?'circle':'swiss',scoreFormat:'classic',seeding:'rating'};
  const assumed=C.formatOf(state,cat.id).minutes;
  const measured=state.matches.filter(m=>m.category===cat.id&&m.status==='done'&&m.startedAt>0&&m.endedAt-m.startedAt>=minute);
  const duration=live&&measured.length>=3?Math.min(assumed*2,Math.max(assumed/2,measured.reduce((sum,m)=>sum+(m.endedAt-m.startedAt)/minute,0)/measured.length)):assumed;
  const metric={id:cat.id,n,duration,count:0,done:0,court:0,span:0,start:Infinity,end:-Infinity,error:''};
  stats.set(cat.id,metric);
  try{
   B.validPlan(cat,n);
   const matches=tasksFor(state,cat,n);
   metric.count=matches.length;
   for(const match of matches)tasks.push({...match,duration});
  }catch(error){metric.error=error.message;}
 }
 const courts=Array(Number.isInteger(state.settings.courts)&&state.settings.courts>0&&state.settings.courts<=32?state.settings.courts:1).fill(current),person=new Map(),done=new Map();
 function record(task,start,finish,effort){
  const metric=stats.get(task.category);
  metric.start=Math.min(metric.start,start);
  metric.end=Math.max(metric.end,finish);
  metric.court+=effort;
  done.set(task.id,finish);
  for(const id of [task.a,task.b])person.set(id,Math.max(person.get(id)??0,finish+rest));
 }
 const pending=tasks.filter(task=>{
  if(!live||!['done','playing'].includes(task.status))return true;
  const since=Number.isFinite(task.startedAt)?(task.startedAt-origin)/minute:(task.endedAt-origin)/minute-task.duration;
  const finish=task.status==='done'?(task.endedAt-origin)/minute:Math.max(since+task.duration,current+2);
  if(task.status==='done')stats.get(task.category).done++;
  else courts[task.court-1]=finish;
  record(task,since,finish,Math.max(0,finish-since));
  return false;
 });
 const latest=new Map(),followers=new Map(),waiting=new Map(),ready=[];
 pending.sort((a,b)=>a.round-b.round);
 for(const task of pending){
  const deps=new Set([...task.after,latest.get(task.a),latest.get(task.b)].filter(id=>id&&!done.has(id)));
  for(const id of deps){
   if(!followers.has(id))followers.set(id,[]);
   followers.get(id).push(task);
  }
  for(const id of [task.a,task.b])latest.set(id,task.id);
  waiting.set(task.id,deps.size);
  if(!deps.size)ready.push(task);
 }
 while(ready.length){
  const court=courts.indexOf(Math.min(...courts));
  function earliest(task){
   return Math.max(courts[court],person.get(task.a)||0,person.get(task.b)||0,...task.after.map(id=>done.get(id)||0));
  }
  let next=0;
  for(let i=1;i<ready.length;i++)if(earliest(ready[i])<earliest(ready[next]))next=i;
  const task=ready.splice(next,1)[0],begin=earliest(task),finish=begin+task.duration;
  courts[court]=finish;
  record(task,begin,finish,task.duration);
  for(const child of followers.get(task.id)||[]){
   const count=waiting.get(child.id)-1;
   waiting.set(child.id,count);
   if(!count)ready.push(child);
  }
 }
 const categories=[...stats.values()];
 for(const metric of categories)metric.span=metric.count&&Number.isFinite(metric.start)?metric.end-metric.start:0;
 const finish=Math.max(0,...categories.map(c=>c.end));
 const played=categories.reduce((sum,c)=>sum+c.done,0);
 const elapsed=live?Math.min(current,played===tasks.length?finish:Infinity):null;
 return {categories,count:tasks.length,done:played,
  invalid:categories.some(c=>c.error)||done.size!==tasks.length,
  duration:finish,court:categories.reduce((sum,c)=>sum+c.court,0),budget,
  elapsed,remaining:elapsed===null?null:Math.max(0,finish-elapsed),reserve:budget-finish};
}
const api={estimate,rest};
root.SwissCourtPlanning=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
