import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import worker from '../dist/server/index.js';
test('release bundle serves every required asset with expected MIME types',async()=>{
 for(const [path,type] of [['/','text/html'],['/tournament.js','text/javascript'],['/protocol.js','text/javascript'],['/sw.js','text/javascript'],['/manifest.webmanifest','application/manifest+json'],['/icon-512.png','image/png']]){
  const response=await worker.fetch(new Request('https://swiss.example'+path));assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes(type));
 }
 assert.equal((await worker.fetch(new Request('https://swiss.example/package-lock.json'))).status,404);
 const matching=await worker.fetch(new Request('https://swiss.example/matching.js'));
 assert.equal(matching.status,200);
 const context={};runInNewContext(await matching.text(),context);
 assert.equal(typeof context.SwissCourtBlossom,'function');
});
test('import endpoint refuses external origins, unsupported URLs and oversized bodies without logging or caching data',async()=>{
 const origin=await worker.fetch(new Request('https://swiss.example/api/import',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}));assert.equal(origin.status,403);
 const unsafe=await worker.fetch(new Request('https://swiss.example/api/import',{method:'POST',body:JSON.stringify({url:'http://127.0.0.1/admin'})}));assert.equal(unsafe.status,400);assert.equal(unsafe.headers.get('cache-control'),'no-store');
 const large=await worker.fetch(new Request('https://swiss.example/api/import',{method:'POST',body:'x'.repeat(5000)}));assert.equal(large.status,413);
});
