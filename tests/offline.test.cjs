const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('offline worker atomically caches the app, serves cached navigation and never caches imports',async()=>{
 const events=new Map(),saved=new Map();let claimed=false,network=0;
 const cache={async addAll(paths){for(const path of paths)saved.set(new URL(path,'https://swiss.example/').href,{body:path});},async match(key){return saved.get(key);}};
 const context=vm.createContext({URL,Uint8Array,Response,
  self:{location:{origin:'https://swiss.example'},registration:{scope:'https://swiss.example/'},clients:{async claim(){claimed=true;}},addEventListener(type,fn){events.set(type,fn);}},
  caches:{async open(){return cache;},async keys(){return ['swisscourt-old','unrelated-cache'];},async delete(key){assert.equal(key,'swisscourt-old');}},
  fetch(){network++;throw Error('offline');}
 });
 vm.runInContext(fs.readFileSync('app/sw.js','utf8').replace('__BUILD__','test'),context);
 let pending;events.get('install')({waitUntil:p=>pending=p});await pending;
 assert.ok(saved.has('https://swiss.example/tournament.js'));assert.ok(saved.has('https://swiss.example/real-ui.js'));
 events.get('activate')({waitUntil:p=>pending=p});await pending;assert.equal(claimed,true);
 events.get('fetch')({request:{url:'https://swiss.example/?scenario=real#board',method:'GET',mode:'navigate'},respondWith:p=>pending=p});
 assert.deepEqual(await pending,{body:'./index.html'});assert.equal(network,0);
 for(const method of ['GET','POST'])events.get('fetch')({request:{url:'https://swiss.example/api/import',method},respondWith(){assert.fail('Import must bypass cache');}});
 assert.equal(typeof context.self.skipWaiting,'undefined');
});
