import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {sourceLink,parseCategories,parsePlayers,importSource} from '../server/import.mjs';
import {forwardLeagueResults,importLeague} from '../server/league.mjs';
const source=sourceLink('https://msk.volan.web-us.ru/category/123-45/players/678-90');
const category='<span data-field="name">B:Мужской парный</span><span data-field="type">md</span><table id="bt-category-players"><tbody data-subset="players"><tr><td><a href="/player/123-45/1"><span data-formula="player_name(player1)">Иванов Иван</span></a></td><td><a href="/player/123-45/2"><span data-formula="player_name(player2)">Петров Пётр</span></a></td></tr><tr><td><a href="/player/123-45/3"><span data-formula="player_name(player1)">Сидоров Семён</span></a></td></tr></tbody><tbody data-subset="reserve"><tr><td>Резерв</td></tr></tbody></table>';
const players='<table><tbody data-subset="players"><tr><td><a href="/player/123-45/1">Иванов Иван</a></td><td data-formula="round(rating_double)">1800</td><td data-formula="round(rating_single)">1900</td></tr><tr><td><a href="/player/123-45/2">Петров Пётр</a></td><td data-formula="round(rating_double)"></td></tr></tbody></table>';
test('import source allows exact public BadminTune routes only',()=>{
 assert.equal(sourceLink('https://msk.volan.web-us.ru/category/123-45/games/678-90').path,source.path);
 for(const url of ['http://msk.volan.web-us.ru/tournament/1-2','https://msk.volan.web-us.ru.evil.com/tournament/1-2','https://127.0.0.1/tournament/1-2','https://u:p@msk.volan.web-us.ru/tournament/1-2','https://msk.volan.web-us.ru/admin'])assert.throws(()=>sourceLink(url));
});
test('parser preserves individual ratings, missing values and name parts, excludes incomplete pairs and reserve',()=>{
 const result=parsePlayers(parse(category),parse(players),source);assert.equal(result.code,'MD');assert.equal(result.entries.length,1);
 const [a,b]=result.entries[0].players;assert.equal(a.rating,1800);assert.equal(b.rating,null);assert.equal(a.surname,'Иванов');assert.equal(a.name,'Иван Иванов');assert.equal(a.sourceId,'123-45:1');
 assert.equal(result.warnings.length,2);
});
test('tournament import keeps distinct source levels rather than merging all MD entrants',()=>{
 const doc=parse('<div data-subset="categories"><div class="category-card"><b data-field="name">A:MD</b><a href="/category/123-45/players/1-2">Состав</a></div><div class="category-card"><b data-field="name">B:MD</b><a href="/category/123-45/players/3-4">Состав</a></div></div>');
 assert.deepEqual(parseCategories(doc,'123-45').categories.map(c=>c.name),['A:MD','B:MD']);
});
test('import fetch disables redirects and caching, rejects changed source formats',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return new Response(url.includes('/category/')?category:players,{headers:{'Content-Type':'text/html'}});};
 const result=await importSource('https://msk.volan.web-us.ru/category/123-45/players/678-90',fetcher);assert.equal(result.entries.length,1);assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.options.redirect==='manual'&&c.options.cache==='no-store'));
 await assert.rejects(importSource('https://msk.volan.web-us.ru/tournament/123-45',async()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1'}})),/Источник/);
});

test('league import uses the fixed export address and checks the selection before accepting even an empty roster',async()=>{
 const data={selection:'1/start/XD',date:'2026-11-25',venue:'КСШ',levelLabel:'СТАРТ',code:'XD',name:'Микст',
  entries:[{players:[{name:'Иванов Иван',rating:1000},{name:'Иванова Анна',rating:null}]}],skipped:{reserve:1,pending:0,search:0}};
 const result=await importLeague(data.selection,async(value,options)=>{
  const url=new URL(value);
  assert.equal(url.host,'d5dvlojr96994pqpp0e9.6brbn2wz.apigw.yandexcloud.net');
  assert.equal(url.search,'?export=swisscourt&tour=1&level=start&division=XD&ids=1');
  assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');
  return Response.json(data);
 });
 assert.equal(result.entries[0].players[0].name,'Иван Иванов');
 assert.equal(result.entries[0].players[1].rating,null);
 assert.deepEqual(result.warnings,['В резерве: 1.']);
 await assert.rejects(importLeague('https://example.org/',()=>assert.fail('Unexpected fetch')),/Выберите/);
 await assert.rejects(importLeague(data.selection,async()=>Response.json({...data,selection:'1/prosport/XD',entries:[]})),/некорректный/);
});

test('result relay posts to the fixed league endpoint with a scoped key and requires its acknowledgement',async()=>{
 const key='a'.repeat(43),upload={id:crypto.randomUUID(),categories:[{code:'XD'}],backup:{closed:true}};
 const result=await forwardLeagueResults({key,upload},async(value,options)=>{
  const url=new URL(value);
  assert.equal(url.host,'d5dvlojr96994pqpp0e9.6brbn2wz.apigw.yandexcloud.net');
  assert.equal(url.search,'?receive=swisscourt');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers['X-SwissCourt-Key'],key);
  assert.deepEqual(JSON.parse(options.body),upload);
  return Response.json({id:upload.id,receivedAt:100,tour:1});
 });
 assert.deepEqual(result,{status:200,data:{id:upload.id,receivedAt:100,tour:1}});
 assert.equal((await forwardLeagueResults({key,upload},async()=>Response.json({id:'other',receivedAt:100}))).status,502);
 assert.equal((await forwardLeagueResults({key:'invalid',upload},()=>assert.fail('Unexpected request'))).status,401);
});
