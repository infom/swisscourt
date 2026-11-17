import http from 'node:http';
import worker from './dist/server/index.js';
const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1';
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
  const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end('Request failed');}
});
server.listen(port,host,()=>console.log('SwissCourt: http://'+host+':'+port));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
