import {parse} from 'node-html-parser';
const origin='https://msk.volan.web-us.ru';
const clean=node=>node?.text.replace(/\s+/g,' ').trim()||'';
const field=(node,name)=>clean(node.querySelector('[data-field="'+name+'"]'));
export function sourceLink(value){
 let url;try{url=new URL(value);}catch{throw Error('Введите полную ссылку BadminTune.');}
 if(url.origin!==origin||url.username||url.password)throw Error('Поддерживаются только HTTPS-ссылки msk.volan.web-us.ru.');
 const path=url.pathname.replace(/^\/public(?=\/)/,'');
 let match=path.match(/^\/tournament\/([0-9]+-[0-9]+)\/?$/);
 if(match)return {type:'tournament',tournamentId:match[1],path:'/public/tournament/'+match[1]};
 match=path.match(/^\/category\/([0-9]+-[0-9]+)\/(?:players|games)\/([0-9]+-[0-9]+)\/?$/);
 if(match)return {type:'category',tournamentId:match[1],categoryId:match[2],path:'/public/category/'+match[1]+'/players/'+match[2]};
 throw Error('Нужна ссылка на турнир или список участников разряда BadminTune.');
}
async function html(path,fetcher){
 const response=await fetcher(origin+path,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!response.ok||response.status>=300)throw Error('Источник недоступен или изменил адрес. Попробуйте позже.');
 if(!response.headers.get('content-type')?.includes('text/html'))throw Error('Источник вернул неизвестный формат.');
 const reader=response.body.getReader();let length=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>2*1024*1024)throw Error('Список источника слишком большой. Выберите конкретный разряд.');chunks.push(value);}}
 catch(error){await reader.cancel();throw error;}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return parse(new TextDecoder().decode(bytes));
}
export function parseCategories(doc,tournamentId){
 const categories=doc.querySelectorAll('[data-subset="categories"] .category-card').flatMap(card=>{
  const link=card.querySelector('a[href*="/players/"]')?.getAttribute('href');if(!link)return [];
  try{const url=new URL(link,origin),source=sourceLink(url.href);if(source.tournamentId!==tournamentId)return [];return [{name:field(card,'name')||'Разряд',url:origin+source.path.replace('/public','')}];}catch{return [];}
 });
 if(!categories.length)throw Error('В турнире не найдены разряды. Проверьте ссылку или добавьте участников вручную.');
 return {name:field(doc,'name'),categories};
}
export function parsePlayers(category,players,source){
 const code=field(category,'type').toUpperCase();if(!['MS','WS','MD','WD','XD'].includes(code))throw Error('Не удалось определить разряд. Структура источника могла измениться.');
 const ratingField=['MS','WS'].includes(code)?'rating_single':code==='XD'?'rating_mix':'rating_double';
 const ratings=new Map();
 for(const row of players.querySelectorAll('tbody[data-subset="players"] > tr')){
  const href=row.querySelector('a[href^="/player/"]')?.getAttribute('href'),pid=href?.split('/').at(-1);if(!pid)continue;
  const raw=clean(row.querySelector('td[data-formula*="'+ratingField+'"]')).replace(/\s/g,'').replace(',','.');
  const rating=raw!==''&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):null;
  ratings.set(pid,rating!==null&&rating<=99999?rating:null);
 }
 const entries=[],warnings=[];let incomplete=0,missing=0;
 const table=category.querySelector('#bt-category-players');if(!table)throw Error('Не найден список участников этого разряда.');
 for(const row of table.querySelectorAll('tbody[data-subset="players"] > tr')){
  const members=[];
  for(let side=1;side<=(['MS','WS'].includes(code)?1:2);side++){
   const cell=row.querySelector('[data-formula="player_name(player'+side+')"]'),name=clean(cell);
   const href=cell?.closest('a')?.getAttribute('href')||cell?.querySelector('a')?.getAttribute('href');
   const pid=href?.split('/').at(-1);
   if(!name||!pid)continue;
   const [surname,...given]=name.split(' '),givenName=given.join(' ');if(!givenName)continue;
   const rating=ratings.get(pid)??null;
   members.push({sourceId:source.tournamentId+':'+pid,surname,givenName,name:givenName+' '+surname,rating});
  }
  if(members.length!==(['MS','WS'].includes(code)?1:2)){if(clean(row))incomplete++;continue;}
  missing+=members.filter(p=>p.rating===null).length;entries.push({players:members});
 }
 if(incomplete)warnings.push('Пропущено неполных заявок: '+incomplete+'.');
 if(missing)warnings.push('Не указан индивидуальный рейтинг у '+missing+' игроков. Заполните его перед стартом.');
 if(!entries.length)warnings.push('Полных заявок не найдено. Проверьте состав в BadminTune.');
 return {source:'BadminTune',name:field(category,'name'),code,level:field(category,'category'),entries,warnings};
}
export async function importSource(value,fetcher=fetch){
 const source=sourceLink(value);
 if(source.type==='tournament')return parseCategories(await html(source.path,fetcher),source.tournamentId);
 const [category,players]=await Promise.all([html(source.path,fetcher),html('/public/players/'+source.tournamentId,fetcher)]);
 return parsePlayers(category,players,source);
}
