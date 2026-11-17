import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {sourceLink,parseCategories,parsePlayers,importSource} from '../server/import.mjs';
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
