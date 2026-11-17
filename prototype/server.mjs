import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const allowed=new Set(['index.html','styles.css','core.js','app.js','simulation.js']);
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const name=pathname==='/'?'index.html':pathname.replace(/^\//,'');
  if(!allowed.has(name)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  const content=await readFile(path.join(root,name));
  res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(content);
 }catch{res.writeHead(500);res.end('Preview unavailable');}
});
server.listen(4173,'127.0.0.1',()=>console.log('SwissCourt preview: http://127.0.0.1:4173'));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
