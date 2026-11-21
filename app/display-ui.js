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
 if(game.bye)return '<button class="game-result bye" data-action="bye-details" data-id="'+game.matchId+'" data-entry="'+esc(id)+'"'+aria+'>–</button>';
 const score=C.shortScore(game.scores);
 const short=score.length>8?' long-score':'';
 return '<button class="game-result '+(game.won?'win':'loss')+short+(game.deciding?' deciding':'')+
  '" data-action="match-details" data-id="'+game.matchId+'" data-entry="'+esc(id)+'"'+aria+'><span class="block-score">'+score+'</span>'+
  (game.deciding?'<sup aria-hidden="true">3</sup>':'')+'</button>';
}
function gameProgress(id,isBoard=false,group){
 const played=C.entryProgress(state,id);
 const matchList=state.matches.filter(m=>(m.a===id||m.b===id)&&(group===undefined||m.group===group));
 const games=matchList.map(m=>m.status==='done'?played.find(g=>g.matchId===m.id):
  m.status==='playing'?{playing:true,round:m.round,court:m.court}:{pending:true,round:m.round}).filter(Boolean);
 if(group===undefined)games.push(...played.filter(game=>game.bye));
 const settled=games.filter(game=>!game.pending).sort((a,b)=>a.round-b.round);
 const pending=games.filter(game=>game.pending).sort((a,b)=>a.round-b.round);
 const limit=isBoard?(state.categories.length>=4?2:4):Infinity;
 const active=settled.filter(game=>game.playing);
 const settledLimit=limit-active.length;
 const recent=settledLimit>0?settled.filter(game=>!game.playing).slice(settledLimit===Infinity?0:-settledLimit):[];
 const shown=[...recent,...active,...pending.slice(0,Math.max(0,limit-recent.length-active.length))].sort((a,b)=>a.round-b.round);
 const more=Math.max(0,settled.length-recent.length-active.length);
 return '<div class="game-progress" aria-label="Сыграно встреч: '+played.filter(game=>!game.bye).length+'">'+
  (more?'<span class="progress-more" title="Предыдущие встречи">+'+more+'</span>':'')+
  (shown.length?shown.map(game=>resultBlock(game,id)).join(''):resultBlock({pending:true},id))+'</div>';
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
    '</span>'+pendingByeMarker(participant)+'</div></td><td class="progress-col">'+gameProgress(participant,isBoard,group)+'</td>'+points+coeff+details+'</tr>';
  }).join('')+'</tbody></table></div>';
}
function bracketLabel(bracket){
 return 'За '+bracket.first+'–'+bracket.last+'-е места';
}
function slotLabel(context,ref){
 const id=context.resolve(ref);
 if(id)return surnames(id);
 if(ref.match){
  const game=context.nodes.find(node=>node.id===ref.match);
  return (ref.outcome==='winner'?'Победитель':'Проигравший')+' · '+(game.forPlace>1?'за '+game.forPlace+'-е · ':'')+game.stage.toLowerCase();
 }
 return ref.place+'-е место группы '+B.letter(ref.group);
}
function bracketMatch(context,node){
 const game=context.matches.get(node.id);
 return '<article class="bracket-match">'+[node.a,node.b].map(ref=>{
  const id=context.resolve(ref);
  let mark={pending:true};
  if(game?.status==='playing')mark={playing:true,court:game.court};
  if(game?.status==='done')mark=C.entryProgress(state,id).find(g=>g.matchId===game.id)||mark;
  return '<div class="bracket-side"><strong class="'+(id?'':'unknown')+'">'+esc(slotLabel(context,ref))+'</strong>'+resultBlock(mark,id)+'</div>';
 }).join('')+'</article>';
}
function bracketView(id,full=false){
 const context=T.bracketContext(state,id);
 return '<div class="bracket-view">'+context.brackets.map(bracket=>{
  const placement=[...new Set(bracket.nodes.map(node=>node.forPlace))].sort((a,b)=>a-b);
  const tracks=placement.map(place=>{
   const nodes=bracket.nodes.filter(m=>m.forPlace===place);
   const rounds=[...new Set(nodes.map(m=>m.round))].sort((a,b)=>a-b);
   const unfinished=rounds.filter(round=>nodes.some(m=>m.round===round&&context.matches.get(m.id)?.status!=='done'));
   const first=unfinished[0]??rounds.at(-1);
   const selected=full?rounds:rounds.slice(rounds.indexOf(first),rounds.indexOf(first)+2);
   return '<div class="bracket-track">'+(place!==bracket.first?'<h4>За '+place+'-е место</h4>':'')+
    '<div class="bracket-stages">'+selected.map(round=>{
     const matches=nodes.filter(m=>m.round===round);
     const passes=full?bracket.skips.filter(skip=>skip.round===round&&skip.forPlace===place).map(skip=>
      '<div class="bracket-match"><div class="bracket-side"><strong>'+esc(slotLabel(context,skip.ref))+'</strong>'+resultBlock({pass:true})+'</div></div>').join(''):'';
     return '<section class="bracket-stage"><h5>'+esc(matches[0].stage)+'</h5>'+matches.map(m=>bracketMatch(context,m)).join('')+passes+'</section>';
    }).join('')+'</div></div>';
  }).join('');
  return '<section class="bracket-section">'+(context.brackets.length>1?'<h3>'+bracketLabel(bracket)+'</h3>':'')+tracks+'</section>';
 }).join('')+'</div>';
}
function groupTables(id,isBoard){
 const context=T.bracketContext(state,id),rows=T.groupStandings(state,id);
 return '<div class="group-tables">'+rows.map((group,index)=>{
  const places=cat(id).playoffs.map((bracket,i)=>{
   const slots=bracket.slots.filter(s=>s.group===index).map(s=>s.place).sort((a,b)=>a-b);
   return slots.length?slots.join(', ')+' → '+(cat(id).playoffs.length>1?bracketLabel(context.brackets[i]).toLowerCase():'плей-офф'):'';
  }).filter(Boolean);
  return '<section><h3>Группа '+B.letter(index)+(context.leads[index]?' · завершена':'')+'</h3>'+
   standingsTable(id,isBoard,group,index)+(places.length?'<p class="group-route">'+esc(places.join(' · '))+'</p>':'')+'</section>';
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
 '<button class="btn" data-action="export">'+icon('download')+'CSV · '+esc(cat(id).code)+'</button>')+
 '<div class="tabs">'+categoryFilters(id,'category',false)+'</div><section class="panel"><div class="panel-heading">'+badge(id)+
 '<strong>'+esc(cat(id).name)+' · '+esc(stageSummary(id))+'</strong>'+
 (state.started&&T.isBracket(state,id)?'<button class="btn small" data-action="full-bracket" data-id="'+id+'">Полная сетка</button>':'')+
 '</div>'+divisionContent(id,false)+progressLegend()+'</section><p class="table-note">'+
 (scheme==='swiss'?swissRankingOrder:scheme==='circle'||scheme==='groups'?circleRankingOrder:'Места по результатам сеток.')+'</p>';
}
