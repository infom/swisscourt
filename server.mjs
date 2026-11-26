import http from 'node:http';
import {execFile} from 'node:child_process';
import worker from './dist/server/index.js';
const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1';
const server=http.createServer(async(req,res)=>{
 try{
  const limit=req.url.split('?')[0]==='/api/league-results'?1024*1024+4096:4096;
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
  const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end('Request failed');}
});
server.listen(port,host,()=>{
 const {address,family,port}=server.address();
 const local=address==='0.0.0.0'?'127.0.0.1':address==='::'?'::1':address;
 const url='http://'+(family==='IPv6'?'['+local+']':local)+':'+port;
 console.log('SwissCourt: '+url);
 if(process.platform==='win32'&&process.argv.includes('--open-browser')){
  execFile('cmd.exe',['/d','/c','start','',url],{windowsHide:true},error=>{
   if(error)console.error('Не удалось открыть браузер автоматически. Откройте '+url);
  });
 }
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
