// 기능 PR의 Chromium 검증에 사용하는 읽기 전용 정적 사이트 서버다.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,relative,isAbsolute} from 'node:path';

const root=resolve(import.meta.dirname,'../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.xml':'application/xml'};
createServer(async(req,res)=>{
  let path;
  try{
    const pathname=decodeURIComponent(new URL(req.url||'/','http://127.0.0.1').pathname);
    path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    const rel=relative(root,path);
    if(rel.startsWith('..')||isAbsolute(rel))throw Error('outside dist');
  }catch{res.writeHead(400);res.end('Bad route');return;}
  try{
    const data=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4174,'127.0.0.1',()=>console.log('브라우저 검증용 정적 사이트: 4174'));
