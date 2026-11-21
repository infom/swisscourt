(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const T=root.SwissCourtTournament||(typeof require==='function'?require('./tournament.js'):null);
const pairKey=m=>[m.a,m.b].sort().join('|');
function plan(state,category){
 if(state.kind!=='tournament'||!state.started||state.closed)return null;
 const entries=T.seeded(state,category);if(T.schemeOf(state,category)!=='swiss')return null;
 const status=T.roundStatus(state,category),round=status.partial?status.round:status.round+1;
 if(round>status.totalRounds)return null;
 const base={...state,matches:state.matches.filter(m=>m.category!==category||m.round<round),byes:state.byes.filter(b=>b.category!==category||b.round<round)};
 const pending=base.matches.filter(m=>m.category===category&&m.status!=='done');
 const locked=state.matches.filter(m=>m.category===category&&m.round===round);
 const unavailable=new Set([...pending,...locked].flatMap(m=>[m.a,m.b]));
 const ready=new Set(entries.filter(e=>!unavailable.has(e.id)).map(e=>e.id));
 if(pending.length&&ready.size<2)return null;
 const points=new Map(C.standings(base,category).map(r=>[r.entry.id,r.points]));
 let common=null,finalDraw=null,combinations=0;
 // Pairing depends on match wins, seed and recorded floats, never on game
 // scores or standings tie-breakers. Enumerate both winners for each pending
 // match. Hypothetical wins exist only in this local Map, never in saved data.
 function visit(index){
  if(common?.size===0)return;
  if(index===pending.length){
   let proposal;
   try{proposal=T.draw(base,category,round,{locked,points});}
   catch(error){if(!pending.length)throw error;common=new Map();return;}
   combinations++;finalDraw=proposal;
   const candidates=new Map(proposal.matches.filter(m=>ready.has(m.a)&&ready.has(m.b)).map(m=>[pairKey(m),m]));
   if(common===null)common=candidates;else for(const key of common.keys())if(!candidates.has(key))common.delete(key);
   return;
  }
  const m=pending[index];
  for(const winner of [m.a,m.b]){points.set(winner,points.get(winner)+1);visit(index+1);points.set(winner,points.get(winner)-1);if(common?.size===0)break;}
 }
 visit(0);
 if(pending.length&&!common?.size)return null;
 const seed=new Map(entries.map((e,i)=>[e.id,i]));
 const matches=[...(common?.values()||[])].map(m=>({...m,id:category+'-'+round+'-ready-'+Math.min(seed.get(m.a),seed.get(m.b))+'-'+Math.max(seed.get(m.a),seed.get(m.b)),...(pending.length?{early:true}:{})}));
 return {dayId:state.id,revision:state.revision,category,round,matches,complete:pending.length===0,bye:pending.length===0?finalDraw?.bye:null,combinations};
}
function apply(state,proposal){
 if(state.id!==proposal.dayId||state.revision!==proposal.revision||state.closed)throw Error('Данные изменились во время расчёта очереди.');
 const status=T.roundStatus(state,proposal.category),round=status.partial?status.round:status.round+1;
 if(round!==proposal.round)throw Error('Этот тур уже изменился.');
 state.matches.push(...structuredClone(proposal.matches));
 state.partialRounds=(state.partialRounds||[]).filter(p=>p.category!==proposal.category);
 if(proposal.complete){if(proposal.bye)state.byes.push(structuredClone(proposal.bye));}
 else state.partialRounds.push({category:proposal.category,round:proposal.round});
 return state;
}
function signature(state){
 return JSON.stringify([state.id,state.started,state.closed,state.entries,state.categories,state.partialRounds,state.byes,state.matches.map(m=>[m.id,m.a,m.b,m.round,m.status==='done'?C.matchResult(state,m).winner:'pending'])]);
}
const api={plan,apply,signature};root.SwissCourtScheduling=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
