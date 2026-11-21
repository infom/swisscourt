import {readSource} from './import.mjs';

const leagueUrl='https://d5dvlojr96994pqpp0e9.6brbn2wz.apigw.yandexcloud.net/';
const sourceName='Клубная лига 8Я';
const selectionPattern=/^([1-9]\d?)\/(prosport|start)\/(MS|WS|MD|WD|XD)$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const labels={prosport:'ПРОСПОРТ',start:'СТАРТ'};
const validText=value=>typeof value==='string'&&value.length>0&&value.length<=100;
const invalid=()=>{throw Error('Лига вернула некорректный список заявок.');};

function validCategory(category){
 const parts=typeof category?.selection==='string'&&category.selection.match(selectionPattern);
 return parts&&category.levelLabel===labels[parts[2]]&&category.code===parts[3]&&datePattern.test(category.date)&&
  validText(category.name)&&validText(category.venue);
}

function leaguePlayer(player){
 if(!validText(player?.name))invalid();
 const [surname,...parts]=player.name.trim().split(/\s+/u),givenName=parts.join(' ');
 const rating=player.rating;
 if(!surname||!givenName||rating!==null&&(!Number.isFinite(rating)||rating<0||rating>99999))invalid();
 return {name:givenName+' '+surname,surname,givenName,rating};
}

export async function importLeague(selection,fetcher=fetch){
 const url=new URL(leagueUrl);
 url.searchParams.set('export','swisscourt');
 if(selection!==undefined){
  const parts=typeof selection==='string'&&selection.match(selectionPattern);
  if(!parts)throw Error('Выберите тур, уровень и разряд лиги.');
  const [,tour,level,division]=parts;
  url.searchParams.set('tour',tour);
  url.searchParams.set('level',level);
  url.searchParams.set('division',division);
 }
 const data=JSON.parse(await readSource(url.href,'application/json',64*1024,fetcher));
 if(selection===undefined){
  if(!Array.isArray(data?.tours)||!data.tours.length||data.tours.some(tour=>
    !Number.isInteger(tour?.number)||!datePattern.test(tour.date)||!validText(tour.name)||!Array.isArray(tour.categories)||
    !tour.categories.length||tour.categories.some(item=>!validCategory(item)||!item.selection.startsWith(tour.number+'/')||item.date!==tour.date)))invalid();
  return {source:sourceName,tours:data.tours};
 }
 if(!validCategory(data)||data.selection!==selection||!Array.isArray(data.entries)||data.entries.length>32)invalid();
 const size=['MS','WS'].includes(data.code)?1:2;
 const entries=data.entries.map(entry=>{
  if(!Array.isArray(entry?.players)||entry.players.length!==size)invalid();
  return {players:entry.players.map(leaguePlayer)};
 });
 const warnings=[];
 for(const [key,message] of Object.entries({pending:'Ожидают подтверждения',reserve:'В резерве',search:'В поиске партнёра'})){
  const count=data.skipped?.[key];
  if(!Number.isSafeInteger(count)||count<0)invalid();
  if(count)warnings.push(message+': '+count+'.');
 }
 if(!entries.length)warnings.push('В основном списке нет подтверждённых заявок.');
 return {source:sourceName,selection,date:data.date,venue:data.venue,levelLabel:data.levelLabel,code:data.code,name:data.name,entries,warnings};
}
