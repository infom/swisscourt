import {mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=new URL('../',import.meta.url),app=new URL('app/',root),dist=new URL('dist/',root),assets={};
await mkdir(new URL('client/',dist),{recursive:true});await mkdir(new URL('server/',dist),{recursive:true});
const files=(await readdir(app)).filter(name=>/\.(?:html|js|css|svg|png|webmanifest)$/.test(name)).sort();
const hash=createHash('sha256');for(const file of files)hash.update(await readFile(new URL(file,app)));
const revision=hash.digest('hex').slice(0,16);
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
for(const name of files){let content=await readFile(new URL(name,app));if(name==='sw.js')content=Buffer.from(content.toString().replace('__BUILD__',revision));
 await writeFile(new URL('client/'+name,dist),content);assets[name]={type:types[name.split('.').at(-1)],data:content.toString('base64')};
}
await writeFile(new URL('assets.generated.mjs',dist),'export default '+JSON.stringify(assets)+';');
await build({entryPoints:[new URL('server/worker.mjs',root).pathname.replace(/^\/([A-Za-z]:)/,'$1')],outfile:new URL('server/index.js',dist).pathname.replace(/^\/([A-Za-z]:)/,'$1'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
await writeFile(new URL('package.json',dist),'{"type":"module"}');
console.log('SwissCourt 1.0.0 · build '+revision+' · '+files.length+' assets');
