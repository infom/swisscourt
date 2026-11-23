(function(root){
'use strict';
const C=root.SwissCourtCore||(typeof require==='function'?require('./core.js'):null);
const B=root.SwissCourtBrackets||(typeof require==='function'?require('./brackets.js'):null);
const T=root.SwissCourtTournament||(typeof require==='function'?require('./tournament.js'):null);
function timestamp(value){
 const date=new Date(value);
 return Number.isFinite(value)&&Number.isFinite(date.getTime())?date.toISOString():null;
}

function scoreboard(rows,swiss,drawRules=false){
 return rows.map(row=>({
  participantId:row.entry.id,place:row.place,sharedPlace:!!row.tied,played:row.played,points:row.points,
  wins:row.wins,draws:row.draws,losses:row.losses,byes:row.byes,
  games:{won:row.setsFor,lost:row.setsAgainst},rallies:{won:row.ballFor,lost:row.ballAgainst,firstTwoDifference:row.firstTwoDiff},
  ...(swiss?{buchholz:row.buchholz,berger:row.berger,byeOpponentPoints:row.byeOpponentPoints}:{}),
  ...(row.headToHead?{personalWinnerId:row.headToHead}:{}),
  ...(row.headToHeadGames!==undefined?{personalGameDifference:row.headToHeadGames,personalRallyDifference:row.headToHeadRallies}:{}),
  ...(row.personalPoints!==undefined?{[drawRules?'personalPoints':'personalWins']:row.personalPoints,
   personalGameDifference:row.personalSets,personalRallyDifference:row.personalBalls}:{}),
  ...(row.qualificationLot?{qualificationByLot:true}:{})
 }));
}
function scoreFormat(id){
 const {label,targets,allowsDraw}=C.scoreFormats[id];
 return {id,label,targets:[...targets],allowsDraw:!!allowsDraw};
}
function matchData(state,match,defaultFormat){
 const result=C.matchResult(state,match),calledAt=timestamp(match.startedAt),recordedAt=timestamp(match.endedAt);
 return {
  id:match.id,participantIds:[match.a,match.b],round:match.round,group:match.group??null,bracket:match.bracket??null,
  stage:match.stage??null,forPlace:match.forPlace??null,scoreFormat:scoreFormat(match.scoreFormat||defaultFormat),
  scores:result.scores,gamesWon:result.wins,outcome:result.winner===null?'draw':'win',
  winnerId:result.winner===null?null:result.winner===0?match.a:match.b,decidedBy:result.decidedBy,
  court:match.playedCourt??null,calledAt,resultRecordedAt:recordedAt,
  secondsFromCallToResult:calledAt&&recordedAt&&match.endedAt>=match.startedAt?Math.round((match.endedAt-match.startedAt)/1000):null
 };
}
function categoryData(state,category){
 const id=category.id,scheme=T.schemeOf(state,id),format=category.scoreFormat||'classic';
 const context=T.isBracket(state,id)?T.bracketContext(state,id):null;
 const groups=scheme==='groups'?T.groupStandings(state,id):[];
 return {
  id,name:category.name||category.code,code:category.code,divisionId:category.division||id,doubles:category.doubles,
  scheme,schemeLabel:B.schemes[scheme],scoreFormat:scoreFormat(format),roundCount:T.roundCount(state,id),
  ...(scheme==='circle'?{circles:category.circles||1}:{}),
  participants:state.entries.filter(entry=>entry.category===id).map(entry=>({id:entry.id,rating:C.rating(entry),
   players:entry.players.map(player=>({name:C.playerFullName(player),rating:player.rating??null}))})),
  drawOrder:T.drawOrder(state,id).slice(),
  standings:scoreboard(T.standings(state,id),scheme==='swiss',C.usesDrawRules(state,id)),
  matches:state.matches.filter(match=>match.category===id&&match.status==='done').slice()
   .sort((a,b)=>a.round-b.round||a.endedAt-b.endedAt).map(match=>matchData(state,match,format)),
  byes:state.byes.filter(bye=>bye.category===id).map(({id,entryId,round})=>({id,participantId:entryId,round,points:1})),
  groups:groups.map((rows,index)=>({index,number:B.groupNumber(index),participantIds:context.groups[index].slice(),standings:scoreboard(rows,false)})),
  brackets:context?context.brackets.map(bracket=>({
   index:bracket.index,mode:bracket.mode,firstPlace:bracket.first,lastPlace:bracket.last,
   matches:bracket.nodes.map(({id,round,stage,forPlace,position,a,b})=>({matchId:id,round,stage,forPlace,position,slots:[a,b]})),
   skips:bracket.skips.map(({ref,round,forPlace,position})=>({slot:ref,participantId:context.resolve(ref),round,forPlace,position})),
   places:bracket.places.map(({ref,place,tied})=>({participantId:context.resolve(ref),place,sharedPlace:tied}))
  })):[]
 };
}
function create(state,version){
 if(state.kind!=='tournament'||!state.closed)throw Error('Сначала зафиксируйте результаты турнира.');
 const leagueSource=state.entries.find(entry=>entry.leagueSource)?.leagueSource;
 const league=typeof leagueSource==='string'?/^(\d+)\/(start|prosport)\//.exec(leagueSource):null;
 const {title,date,venue,level,courts}=state.settings;
 return {
  kind:'swisscourt.tour-protocol',schemaVersion:1,producer:{name:'SwissCourt',version},
  event:{id:state.id,revision:state.revision,title,date,venue,level,league:league?{tour:Number(league[1]),level:league[2]}:null,
   startedAt:timestamp(state.startedAt),courtCount:courts,rentalMinutes:T.rentalDuration(state.settings),restMinutes:C.restInterval(state.settings)},
  categories:state.categories.map(category=>categoryData(state,category))
 };
}
const api={create};root.SwissCourtProtocol=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
