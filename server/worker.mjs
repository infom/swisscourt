import {importSource} from './import.mjs';
import assets from '../dist/assets.generated.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
export default {async fetch(request){
 const url=new URL(request.url);
 if(url.pathname==='/api/import'){
  if(request.method!=='POST')return json({error:'Используйте POST.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Запрос доступен только из SwissCourt.'},403);
  try{
   if(Number(request.headers.get('content-length'))>4096)return json({error:'Слишком длинная ссылка.'},413);
   const text=await request.text();if(text.length>4096)return json({error:'Слишком длинная ссылка.'},413);
   const data=JSON.parse(text);if(typeof data.url!=='string')throw Error('Укажите ссылку.');
   return json(await importSource(data.url));
  }catch(error){return json({error:error.name==='TimeoutError'?'Источник не ответил вовремя. Попробуйте позже.':error.message},400);}
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1),asset=assets[name];
 if(!asset)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"}});
}};
