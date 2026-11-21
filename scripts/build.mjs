import {mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=new URL('../',import.meta.url),app=new URL('app/',root),dist=new URL('dist/',root),assets={};
const {version}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
await mkdir(new URL('client/',dist),{recursive:true});await mkdir(new URL('server/',dist),{recursive:true});
const files=(await readdir(app)).filter(name=>/\.(?:html|js|css|svg|png|webmanifest)$/.test(name)).sort();
const matchingLicense=await readFile(new URL('node_modules/edmonds-blossom-fixed/LICENSE',root),'utf8');
const matching=await build({
 stdin:{contents:"module.exports = require('edmonds-blossom-fixed')",resolveDir:new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')},
 bundle:true,format:'iife',globalName:'SwissCourtBlossom',platform:'browser',write:false,minify:true,
 banner:{js:'/*! edmonds-blossom-fixed\n'+matchingLicense+'\n*/'}
});
const contents=new Map(await Promise.all(files.map(async name=>[name,await readFile(new URL(name,app))])));
contents.set('matching.js',Buffer.from(matching.outputFiles[0].contents));
const hash=createHash('sha256');for(const content of contents.values())hash.update(content);
const revision=hash.digest('hex').slice(0,16);
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
for(let [name,content] of contents){if(name==='sw.js')content=Buffer.from(content.toString().replace('__BUILD__',revision));
 await writeFile(new URL('client/'+name,dist),content);assets[name]={type:types[name.split('.').at(-1)],data:content.toString('base64')};
}
await writeFile(new URL('assets.generated.mjs',dist),'export default '+JSON.stringify(assets)+';');
await build({entryPoints:[new URL('server/worker.mjs',root).pathname.replace(/^\/([A-Za-z]:)/,'$1')],outfile:new URL('server/index.js',dist).pathname.replace(/^\/([A-Za-z]:)/,'$1'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
await writeFile(new URL('package.json',dist),'{"type":"module"}');
console.log('SwissCourt '+version+' · build '+revision+' · '+contents.size+' assets');
