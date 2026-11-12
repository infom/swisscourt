// Prior demo retained only as a stable regression fixture for round-robin and blocked games.
const original=require('./legacy-day.json');
module.exports=function legacyDay(mode='live',now=Date.now()){
 const state=structuredClone(original),offset=now-100000000;
 state.started=mode==='live';
 if(!state.started){state.matches=[];state.history=[];return state;}
 for(const match of state.matches){
  if(match.startedAt!==undefined)match.startedAt+=offset;
  if(match.endedAt!==undefined)match.endedAt+=offset;
 }
 return state;
};
