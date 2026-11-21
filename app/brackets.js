(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const schemes={circle:'Круговая',swiss:'Швейцарская',knockout:'Олимпийка',groups:'Группы + плей-офф'};
const modes={single:'Навылет',bronze:'Навылет + 3-е место',selected:'За 1-е, 3-е, 5-е и 9-е места',full:'Все места'};
const letter=group=>String.fromCharCode(65+group);
const roundRobinCount=n=>n*(n-1)/2;
const groupSizes=(n,count)=>Array.from({length:count},(_,i)=>Math.floor(n/count)+(i<n%count?1:0));
function validPlan(category,n){
 const {scheme,rounds,groupCount,playoffs,bracketMode,scoreFormat,seeding}=category;
 if(!Object.hasOwn(schemes,scheme)||!Object.hasOwn(C.scoreFormats,scoreFormat)||!['rating','random','manual'].includes(seeding))throw Error('Проверьте схему, формат счёта и посев.');
 if(!Number.isInteger(n)||n<2||n>32)throw Error('Нужно от 2 до 32 участников.');
 if(scheme==='swiss'&&rounds>n-1+n%2)throw Error('Для '+rounds+' туров нужно больше участников.');
 if(scheme==='knockout'&&(!Object.hasOwn(modes,bracketMode)||(bracketMode==='bronze'&&n<4)))throw Error('Для матча за 3-е нужно не меньше четырёх участников.');
 if(scheme!=='groups')return;
 if(n>16)throw Error('Разделите состав на две категории. В группах максимум 16 участников на категорию.');
 if(!Number.isInteger(groupCount)||groupCount<1||groupCount>4)throw Error('Выберите от 1 до 4 групп.');
 const sizes=groupSizes(n,groupCount);
 if(sizes.some(size=>size<2||size>4))throw Error('В каждой группе должно быть от 2 до 4 участников.');
 if(!Array.isArray(playoffs)||playoffs.length<1||playoffs.length>4)throw Error('Выберите от 1 до 4 сеток.');
 const used=new Set();
 for(const bracket of playoffs){
  if(!Object.hasOwn(modes,bracket.mode)||!Array.isArray(bracket.slots)||bracket.slots.length<2)throw Error('В каждой сетке нужно хотя бы два места из групп.');
  if(bracket.mode==='bronze'&&bracket.slots.length<4)throw Error('Для матча за 3-е нужно не меньше четырёх мест в сетке.');
  for(const {group,place} of bracket.slots){
   const key=group+':'+place;
   if(!Number.isInteger(group)||!Number.isInteger(place)||place<1||place>sizes[group]||!sizes[group])throw Error('Проверьте места выхода с учётом размеров групп.');
   if(used.has(key))throw Error('Место из группы можно направить только в одну сетку.');
   used.add(key);
  }
 }
}
function seedSlots(refs){
 let order=[1];while(order.length<refs.length){
  const size=order.length*2;order=order.flatMap(seed=>[seed,size+1-seed]);
 }
 return order.map(seed=>refs[seed-1]||null);
}
function stageLabel(size){return size===2?'Финал':size===4?'Полуфинал':'1/'+(size/2)+' финала';}
function bracketGraph(category,index,refs,mode,baseRound=0,offset=0){
 const nodes=[],places=[],skips=[];
 const assign=(slots,place)=>slots.forEach(ref=>places.push({ref,place:offset+place,tied:slots.length>1}));
 function branch(slots,first,round){
  if(slots.length===1){assign(slots,first);return;}
  const winners=[],losers=[];
  for(let i=0;i<slots.length;i+=2){
   const a=slots[i],b=slots[i+1];
   if(!a||!b){
    winners.push(a||b);
    skips.push({ref:a||b,round,forPlace:offset+first});
    continue;
   }
   const id=category+'-b'+index+'-m'+nodes.length;
   nodes.push({id,category,bracket:index,round,stage:stageLabel(slots.length),forPlace:offset+first,a,b});
   winners.push({match:id,outcome:'winner'});
   losers.push({match:id,outcome:'loser'});
  }
  branch(winners,first,round+1);
  if(!losers.length)return;
  const next=first+winners.length;
  if(mode==='full'||first===1&&(mode==='bronze'&&next===3||mode==='selected'&&[3,5,9].includes(next))){
   branch(seedSlots(losers),next,round+1);
  }else assign(losers,next);
 }
 branch(seedSlots(refs),1,baseRound+1);
 return {nodes,places,skips,index,first:offset+1,last:offset+refs.length,mode};
}
function splitGroups(order,count){
 const groups=Array.from({length:count},()=>[]);
 order.forEach((id,index)=>{
  const row=Math.floor(index/count),col=index%count;
  groups[row%2&&(row+1)*count<=order.length?count-1-col:col].push(id);
 });
 return groups;
}
function groupMatches(category,groups){
 return groups.flatMap((ids,group)=>Array.from({length:ids.length-1+ids.length%2},(_,i)=>
  C.roundRobin(ids,i+1).map(([a,b],index)=>({id:category+'-g'+group+'-r'+(i+1)+'-'+index,category,group,round:i+1,a,b,status:'queued',pinned:false}))
 ).flat());
}
function bracketSeeds(slots,preferCross){
 const refs=slots.slice().sort((a,b)=>a.place-b.place||a.group-b.group).map(slot=>({...slot}));
 if(!preferCross)return refs;
 const paired=seedSlots(refs);
 // Keep better group places seeded higher. Rearrange equal seeds to avoid
 // a repeat from the same group in each opening pair where possible.
 for(let i=0;i<paired.length;i+=2){
  const a=paired[i],b=paired[i+1];
  if(!a||!b||a.group!==b.group)continue;
  for(const side of [i+1,i]){
   const here=paired[side],other=paired[side^1];
   const candidate=paired.findIndex((slot,j)=>slot&&j!==i&&j!==i+1&&slot.place===here.place&&slot.group!==other.group&&paired[j^1]&&paired[j^1].group!==here.group);
   if(candidate===-1)continue;
   const one=refs.indexOf(here),two=refs.indexOf(paired[candidate]);
   [refs[one],refs[two]]=[refs[two],refs[one]];
   [paired[side],paired[candidate]]=[paired[candidate],paired[side]];
   break;
  }
 }
 return refs;
}
function layout(category,order){
 const id=category.id;
 if(category.scheme==='knockout')return {groups:[],games:[],brackets:[bracketGraph(id,0,order.map(entry=>({entry})),category.bracketMode)]};
 const groups=splitGroups(order,category.groupCount),games=groupMatches(id,groups);
 const baseRound=Math.max(0,...games.map(m=>m.round));
 let offset=0;
 const brackets=category.playoffs.map((bracket,index)=>{
  const refs=bracketSeeds(bracket.slots,true);
  const result=bracketGraph(id,index,refs,bracket.mode,baseRound,offset);
  offset+=refs.length;
  return result;
 });
 return {groups,games,brackets};
}
function matchCount(category,n){
 if(category.scheme==='circle')return roundRobinCount(n);
 if(category.scheme==='swiss')return Math.floor(n/2)*category.rounds;
 const structure=layout(category,Array.from({length:n},(_,i)=>'p'+i));
 return structure.games.length+structure.brackets.reduce((sum,bracket)=>sum+bracket.nodes.length,0);
}
function context(state,category,groupRank){
 const structure=layout(category,state.drawOrders[category.id]);
 const matches=new Map(state.matches.filter(m=>m.category===category.id).map(m=>[m.id,m]));
 const leads=structure.groups.map((ids,group)=>{
  const complete=structure.games.filter(m=>m.group===group).every(m=>matches.get(m.id)?.status==='done');
  return complete?groupRank(state,category.id,group,ids).map(row=>row.entry.id):null;
 });
 function resolve(ref){
  if(ref.entry)return ref.entry;
  if(ref.match){
   const match=matches.get(ref.match);
   if(match?.status!=='done')return null;
   const result=C.matchResult(state,match),side=ref.outcome==='winner'?result.winner:1-result.winner;
   return side===0?match.a:match.b;
  }
  return leads[ref.group]?.[ref.place-1]||null;
 }
 const nodes=structure.brackets.flatMap(b=>b.nodes);
 const expected=[...structure.games,...nodes.flatMap(node=>{
  const a=resolve(node.a),b=resolve(node.b);
  return a&&b?[{id:node.id,category:node.category,bracket:node.bracket,round:node.round,stage:node.stage,forPlace:node.forPlace,a,b,status:'queued',pinned:false}]:[];
 })];
 return {...structure,nodes,matches,leads,resolve,expected};
}
const api={schemes,modes,letter,groupSizes,validPlan,layout,matchCount,context};
root.SwissCourtBrackets=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
