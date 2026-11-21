'use strict';
function progressLabel(game){
 if(game.pass)return 'Пропуск круга сетки';
 if(game.bye)return 'Тур '+game.round+' · Пропуск · +1 очко';
 if(game.playing)return 'На корте '+game.court;
 if(game.pending)return 'Встреча ещё не сыграна';
 return (game.won?'Победа':'Поражение')+' · '+surnames(game.opponentId)+' · '+game.scores.map(score=>score.join(':')).join(', ');
}
function resultBlock(game,id){
 const label=esc(progressLabel(game)),aria=' title="'+label+'" aria-label="'+label+'"';
 if(game.playing)return '<span class="game-result playing"'+aria+'><b>'+game.court+'</b></span>';
 if(game.pending)return '<span class="game-result pending"'+aria+'></span>';
 if(game.pass)return '<span class="game-result bye"'+aria+'>–</span>';
 if(game.bye)return boardMode?'<span class="game-result bye"'+aria+'>–</span>':'<button class="game-result bye" data-action="bye-details" data-id="'+game.matchId+'" data-entry="'+esc(id)+'"'+aria+'>–</button>';
 const tag=boardMode?'span':'button';
 const display=C.shortScore(game.scores).split(';').map((part,i,parts)=>'<span class="game-score-line">'+
  '<span>'+(part.startsWith('−')?'−':'')+'</span><span>'+part.replace('−','')+'</span><span>'+(i<parts.length-1?';':'')+'</span></span>').join('');
 const action=boardMode?'':' data-action="match-details" data-id="'+game.matchId+'" data-entry="'+esc(id)+'"';
 return '<'+tag+' class="game-result '+(game.won?'win':'loss')+(game.deciding?' deciding':'')+'"'+action+aria+
  '><span class="block-score">'+display+'</span>'+(game.deciding?'<sup aria-hidden="true">3</sup>':'')+'</'+tag+'>';
}
function gameProgress(id,group){
 const played=C.entryProgress(state,id);
 const matchList=state.matches.filter(m=>(m.a===id||m.b===id)&&(group===undefined||m.group===group));
 const games=matchList.map(m=>m.status==='done'?played.find(g=>g.matchId===m.id):
  m.status==='playing'?{playing:true,round:m.round,court:m.court}:{pending:true,round:m.round}).filter(Boolean);
 if(group===undefined)games.push(...played.filter(game=>game.bye));
 games.sort((a,b)=>a.round-b.round);
 return '<div class="game-progress" aria-label="Сыграно встреч: '+played.filter(game=>!game.bye).length+'">'+
  (games.length?games.map(game=>resultBlock(game,id)).join(''):resultBlock({pending:true},id))+'</div>';
}
function progressLegend(){
 return '<div class="progress-legend" aria-label="Обозначения результатов"><span><i class="game-result win"></i>Победа</span><span><i class="game-result loss"></i>Поражение</span>'+
  '<span><i class="deciding-key">3</i>Три партии</span><span><i class="game-result playing">7</i>Корт</span><span><i class="game-result bye">–</i>Пропуск</span></div>';
}
const coefficient=value=>value===Infinity?'∞':Number(value||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
const difference=value=>value>0?'+'+value:String(value||0);
const ratioText=(a,b)=>coefficient(b?a/b:(a?Infinity:0));
const circleRankingOrder='Очки → личные встречи → разница партий в личных встречах → разница воланов в личных встречах → разница партий во всех встречах → разница воланов во всех встречах → меньший рейтинг';
const swissRankingOrder='Очки → Соперники → Побеждённые → личная встреча двух равных → отношение партий → разница воланов первых двух партий → разница всех воланов';
function statsFor(row,scheme){
 const stats=[
  ['Игры',row.played],['Победы',row.wins],['Поражения',row.losses],['Турнирные очки',row.points],
  ['Партии',row.setsFor+':'+row.setsAgainst],['Разница партий',difference(row.setsFor-row.setsAgainst)],['Отношение партий',ratioText(row.setsFor,row.setsAgainst)],
  ['Воланы',row.ballFor+':'+row.ballAgainst],['Разница воланов 1–2-й партий',difference(row.firstTwoDiff)],
  ['Разница всех воланов',difference(row.ballFor-row.ballAgainst)],['Рейтинг',C.rating(row.entry)]
 ];
 if(scheme==='swiss')stats.push(['Соперники',coefficient(row.buchholz)],['Побеждённые',coefficient(row.berger)],['Пропуски',row.byes],
  ['Очки условных соперников за пропуск',coefficient(row.byeOpponentPoints)],['Личная встреча',row.headToHead?surnames(row.headToHead)+' · победа':'—']);
 if(row.personalPoints!==undefined)stats.push(['Побед среди равных',row.personalPoints],['Разница партий среди равных',difference(row.personalSets)],['Разница воланов среди равных',difference(row.personalBalls)]);
 if(row.qualificationLot)stats.push(['Порядок выхода из группы','Жребий при равенстве']);
 return stats;
}
function showEntryStats(id,group){
 const player=entry(id);
 if(!player)return;
 const scheme=T.schemeOf(state,player.category);
 const rows=group===undefined?T.standings(state,player.category):T.groupStandings(state,player.category)[Number(group)];
 const row=rows?.find(r=>r.entry.id===id);
 if(row)dialog('Показатели участника',esc(surnames(id)), '<dl class="stats-list">'+
  statsFor(row,scheme).map(([name,value])=>'<div><dt>'+name+'</dt><dd>'+esc(value)+'</dd></div>').join('')+
  '</dl><p class="table-note">'+(scheme==='swiss'?swissRankingOrder:scheme==='circle'||group!==undefined?circleRankingOrder:'Места определяются результатами сеток.')+'</p>',cancel);
}
function standingsTable(id,isBoard=false,rows=T.standings(state,id),group){
 const scheme=T.schemeOf(state,id),swiss=scheme==='swiss';
 const coefficients=swiss&&(!isBoard||state.categories.length<=2);
 const playoff=T.isBracket(state,id)&&group===undefined;
 const header=coefficients?'<th class="numeric tiebreak-col">Соперники</th><th class="numeric tiebreak-col">Побежденные</th>':'';
 const extras=!isBoard?'<th class="numeric" title="Игры">И</th><th class="numeric" title="Победы">В</th><th class="numeric" title="Поражения">П</th>'+
  '<th class="numeric">Партии</th><th class="numeric">Воланы</th><th class="numeric" title="Разница воланов первых двух партий">Δ 1–2</th><th class="numeric">Δ все</th><th>Показатели</th>':'';
 return '<div class="table-wrap"><table class="standings-table"><thead><tr><th class="place-col">№</th><th>Участник</th><th class="progress-col">Прогресс</th>'+
  (!playoff?'<th class="numeric points-col">Очки</th>':'')+header+extras+'</tr></thead><tbody>'+rows.map(row=>{
   const participant=row.entry.id,leader=row.place===1&&(playoff||row.points>0),place=row.place??'—';
   const players=entry(participant).players.map(p=>'<span>'+esc(C.playerLabel(state,p))+'</span>').join('<span class="teammate-divider"> / </span>');
   const position=leader?'<span class="leader-mark" aria-label="Первое место">'+icon('crown')+'<small>1'+(row.tied?'=':'')+'</small></span>':
    '<span class="place">'+place+(row.tied?'=':'')+'</span>';
   const points=!playoff?'<td class="numeric points-col"><strong>'+row.points+'</strong></td>':'';
   const coeff=coefficients?'<td class="numeric tiebreak-col">'+coefficient(row.buchholz)+'</td><td class="numeric tiebreak-col">'+coefficient(row.berger)+'</td>':'';
   const details=isBoard?'':'<td class="numeric">'+row.played+'</td><td class="numeric">'+row.wins+'</td><td class="numeric">'+row.losses+'</td>'+
    '<td class="numeric">'+row.setsFor+':'+row.setsAgainst+'</td><td class="numeric">'+row.ballFor+':'+row.ballAgainst+'</td>'+
    '<td class="numeric">'+difference(row.firstTwoDiff)+'</td><td class="numeric">'+difference(row.ballFor-row.ballAgainst)+'</td>'+
    '<td><button class="btn small" data-action="entry-stats" data-id="'+participant+'" '+(group!==undefined?'data-group="'+group+'"':'')+' aria-label="Показатели '+esc(surnames(participant))+'">Подробнее</button></td>';
   return '<tr'+(leader?' class="leader-row"':'')+'><td class="place-col">'+position+'</td><td class="standings-names"><div class="standing-team"><span class="standing-players">'+players+
    '</span>'+pendingByeMarker(participant)+'</div></td><td class="progress-col">'+gameProgress(participant,group)+'</td>'+points+coeff+details+'</tr>';
  }).join('')+'</tbody></table></div>';
}
function bracketLabel(bracket){
 return 'За '+bracket.first+'–'+bracket.last+'-е места';
}
function chessTable(category,rows,order,label,group){
 const rankings=new Map(rows.map(row=>[row.entry.id,row]));
 const progresses=new Map(order.map(id=>[id,new Map(C.entryProgress(state,id).map(game=>[game.matchId,game]))]));
 const matches=new Map();
 for(const match of state.matches.filter(m=>m.category===category&&(group===undefined||m.group===group))){
  const pair=[match.a,match.b].sort().join('/');
  if(!matches.has(pair))matches.set(pair,[]);
  matches.get(pair).push(match);
 }
 const header='<tr><th scope="col" class="chess-number">№</th><th scope="col" class="chess-player">'+esc(label)+'</th>'+
  order.map((id,index)=>'<th scope="col" aria-label="'+esc((index+1)+' · '+surnames(id))+'">'+(index+1)+'</th>').join('')+'<th scope="col">Очки</th></tr>';
 return '<table class="chess-table" aria-label="'+esc('Шахматка · '+label)+'"><thead>'+header+'</thead><tbody>'+order.map((id,index)=>{
  const row=rankings.get(id),leader=row?.place===1&&row.points>0;
  const cells=order.map(opponent=>{
   if(opponent===id)return '<td class="chess-self" aria-label="Своя пара">–</td>';
   const games=matches.get([id,opponent].sort().join('/'))||[];
   return '<td><div class="chess-games">'+games.map(match=>resultBlock(match.status==='done'?(progresses.get(id).get(match.id)||{pending:true}):
    match.status==='playing'?{playing:true,court:match.court}:{pending:true},id)).join('')+'</div></td>';
  }).join('');
  return '<tr><td class="chess-number">'+(index+1)+'</td><th scope="row" class="chess-player">'+
   (leader?'<span class="chess-leader" aria-label="Первое место">'+icon('crown')+'</span>':'')+'<span class="team-names">'+pairNames(id)+'</span></th>'+cells+
   '<td class="points-col"><strong>'+(row?.points??0)+'</strong></td></tr>';
 }).join('')+'</tbody></table>';
}
function slotLabel(context,ref){
 const id=context.resolve(ref);
 if(id)return surnames(id);
 if(ref.match){
  const game=context.nodes.find(node=>node.id===ref.match);
  return (ref.outcome==='winner'?'Победитель':'Проигравший')+' · '+game.stage.toLowerCase()+' №'+(game.position+1);
 }
 return ref.place+'-е место группы '+B.groupNumber(ref.group);
}
function bracketCard(context,item,renderSeat){
 const {node,skip,y,title}=item;
 const refs=skip?[skip.ref,null]:[node.a,node.b];
 const game=node&&context.matches.get(node.id);
 const contents=refs.map(ref=>{
  if(!ref)return '<div class="bracket-side"><strong class="unknown">Пропуск</strong>'+resultBlock({pass:true})+'</div>';
  const id=context.resolve(ref),label=slotLabel(context,ref);
  if(renderSeat)return renderSeat(id,label);
  let mark={pending:true};
  if(game?.status==='playing')mark={playing:true,court:game.court};
  if(game?.status==='done')mark=C.entryProgress(state,id).find(g=>g.matchId===game.id)||mark;
  return '<div class="bracket-side"><strong'+(!id?' class="unknown"':'')+'>'+esc(label)+'</strong>'+resultBlock(mark,id)+'</div>';
 }).join('');
 return '<article class="bracket-match bracket-card" style="--bracket-y:'+y+'"><h5>'+esc(title)+'</h5>'+contents+'</article>';
}
function bracketTrack(context,bracket,nodes,addOn,full,renderSeat){
 const place=nodes[0].forPlace,rounds=[...new Set(nodes.map(node=>node.round))].sort((a,b)=>a-b);
 const firstOpen=rounds.findIndex(round=>nodes.some(node=>node.round===round&&context.matches.get(node.id)?.status!=='done'));
 const start=full?0:firstOpen<0?rounds.length-1:firstOpen;
 const shown=full?rounds:rounds.slice(start,start+2);
 const columns=shown.map((round,index)=>{
  const games=nodes.filter(node=>node.round===round),skips=bracket.skips.filter(skip=>skip.round===round&&skip.forPlace===place);
  const position=item=>(item.position+.5)*2**index-.5;
  const title=matchStage(games[0]);
  const cards=[...games.map(node=>({node,y:position(node),title:title+(games.length+skips.length>1?' · '+(node.position+1):'')})),
   ...skips.map(skip=>({skip,y:position(skip),title:title+' · '+(skip.position+1)}))].sort((a,b)=>a.y-b.y);
  if(addOn?.round===round)cards.push({node:addOn,y:cards.at(-1).y+1,title:matchStage(addOn)});
  return cards;
 });
 const lastRow=Math.max(...columns.flat().map(card=>card.y));
 return '<div class="bracket-track"><div class="bracket-stages" style="--bracket-columns:'+columns.length+';--bracket-last:'+lastRow+'">'+columns.map((cards,index)=>{
  const previous=columns[index-1]||[];
  const lines=cards.flatMap(card=>{
   const refs=card.skip?[card.skip.ref]:[card.node.a,card.node.b];
   return refs.flatMap(ref=>{
    const from=previous.find(item=>item.skip?.ref===ref||ref.match&&item.node?.id===ref.match);
    if(!from)return [];
    const isLoser=ref.outcome==='loser'&&!from.skip;
    return ['<span aria-hidden="true" class="bracket-edge '+(from.y>card.y?'rises ':'')+(isLoser?'loser-path':'')+
     '" style="--edge-y:'+Math.min(from.y,card.y)+';--edge-span:'+Math.abs(from.y-card.y)+'"><i></i></span>'];
   });
  }).join('');
  return '<section class="bracket-stage">'+lines+cards.map(card=>bracketCard(context,card,renderSeat)).join('')+'</section>';
 }).join('')+'</div></div>';
}
function bracketTree(context,full,renderSeat){
 return '<div class="bracket-view">'+context.brackets.map(bracket=>{
  const main=bracket.nodes.filter(node=>node.forPlace===bracket.first);
  const playForBronze=bracket.nodes.find(node=>node.forPlace===bracket.first+2&&node.stage==='Финал'&&
   [node.a,node.b].every(ref=>ref.outcome==='loser'&&main.some(source=>source.id===ref.match&&source.stage==='Полуфинал')));
  const tracks=new Map();
  for(const node of bracket.nodes){
   if(node===playForBronze)continue;
   if(!tracks.has(node.forPlace))tracks.set(node.forPlace,[]);
   tracks.get(node.forPlace).push(node);
  }
  return '<section class="bracket-section">'+[...tracks].sort(([a],[b])=>a-b).map(([place,nodes])=>
   bracketTrack(context,bracket,nodes,place===bracket.first?playForBronze:null,full,renderSeat)).join('')+'</section>';
 }).join('')+'</div>';
}
function bracketView(id,full=false){
 return bracketTree(T.bracketContext(state,id),full);
}
function groupTables(id,isBoard){
 const context=T.bracketContext(state,id),rows=T.groupStandings(state,id);
 const playoffs=B.groupPlayoffs(cat(id),state.entries.filter(e=>e.category===id).length);
 return '<div class="group-tables">'+rows.map((group,index)=>{
  const places=playoffs.map((bracket,i)=>{
   const slots=bracket.slots.filter(s=>s.group===index).map(s=>s.place).sort((a,b)=>a-b);
   return slots.length?slots.join(', ')+' → '+(cat(id).playoffs.length>1?bracketLabel(context.brackets[i]).toLowerCase():'плей-офф'):'';
  }).filter(Boolean);
  const name='Группа '+B.groupNumber(index);
  return '<section>'+(isBoard?chessTable(id,group,context.groups[index],name,index):'<h3>'+name+'</h3>'+standingsTable(id,false,group,index))+
   (places.length?'<p class="group-route">'+esc(places.join(' · '))+'</p>':'')+'</section>';
 }).join('')+'</div>';
}
function stageSummary(id){
 const p=categoryProgress(id),scheme=T.schemeOf(state,id);
 if(!state.started)return 'Подготовка';
 if(p.total&&p.done===p.total)return 'Итоговые места';
 if(scheme==='groups'){
  const context=T.bracketContext(state,id),ongoing=context.leads.some(rows=>!rows);
  return ongoing?(context.nodes.some(node=>context.matches.has(node.id))?'Группы и плей-офф':'Группы'):'Плей-офф';
 }
 if(scheme==='knockout')return 'Олимпийка';
 if(scheme==='circle')return 'Круговая';
 const playable=state.matches.filter(m=>m.category===id&&m.status!=='done');
 const earliest=playable.length?Math.min(...playable.map(m=>m.round)):p.round;
 const ahead=[...new Set(playable.filter(m=>m.round>earliest).map(m=>m.round))];
 const old=state.matches.filter(m=>m.category===id&&m.round===earliest);
 const played=old.filter(m=>m.status==='done').length;
 return 'Тур '+earliest+' / '+p.rounds+' · '+played+'/'+old.length+(ahead.length?' · Тур '+ahead.join(', ')+' в очереди':'');
}
function divisionContent(id,isBoard){
 if(isBoard&&!state.started)return '<div class="board-preparing">Составы готовятся</div>';
 if(isBoard&&T.schemeOf(state,id)==='circle'&&!state.closed)return chessTable(id,T.standings(state,id),T.drawOrder(state,id),'Круговая');
 if(!state.started||!T.isBracket(state,id))return standingsTable(id,isBoard);
 const scheme=T.schemeOf(state,id),status=T.roundStatus(state,id);
 if(status.complete)return standingsTable(id,isBoard);
 const context=T.bracketContext(state,id);
 const groups=scheme==='groups'&&context.leads.some(lead=>!lead);
 return '<div class="division-content">'+(groups?groupTables(id,isBoard):'')+
  (groups&&!context.leads.some(Boolean)?'':bracketView(id,!isBoard))+'</div>';
}
function standings(){
 const id=selectedCategory,scheme=T.schemeOf(state,id);
 return heading('Турнирные таблицы','Положение и показатели по завершённым встречам.',
 '<button class="btn" data-action="export">'+icon('download')+'CSV · '+esc(cat(id).code)+'</button>'+
 (mode==='real'&&state.closed?'<button class="btn primary" data-action="send-league-results">Передать в Лигу 8Я</button>':''))+
 '<div class="tabs">'+categoryFilters(id,'category',false)+'</div><section class="panel"><div class="panel-heading">'+badge(id)+
 '<strong>'+esc(stageSummary(id))+'</strong>'+
 (state.started&&T.isBracket(state,id)?'<button class="btn small" data-action="full-bracket" data-id="'+id+'">Полная сетка</button>':'')+
 '</div>'+divisionContent(id,false)+progressLegend()+'</section><p class="table-note">'+
 (scheme==='swiss'?swissRankingOrder:scheme==='circle'||scheme==='groups'?circleRankingOrder:'Места по результатам сеток.')+'</p>';
}
