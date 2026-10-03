import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeHistory,emptyHistory} from '../lib/prices.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const port=Number(process.env.WOLT_PORT||4173);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
await fs.mkdir(path.join(root,'data'),{recursive:true});
try{await fs.access(path.join(root,'data/history.json'));}catch{await fs.writeFile(path.join(root,'data/history.json'),JSON.stringify(emptyHistory()));}
let importing=false;
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(403);res.end('Local only');return;}
 if(req.method==='GET'&&url.pathname==='/import'){res.setHeader('Content-Type',types['.html']);res.end('<!doctype html><html lang="sv"><meta charset="utf-8"><title>Importera Wolt-priser</title><style>body{font:18px system-ui;max-width:850px;margin:60px auto;background:#f5f6f3}textarea{width:100%;height:400px}button{padding:15px;margin-top:20px}</style><h1>Importera menyavläsning</h1><p>Endast restaurangnamn, menypriser och tidpunkter. Tidigare avläsningar bevaras.</p><form method="post" action="/ingest"><label for="data">Menydata (JSON)</label><textarea id="data" name="data" required></textarea><button>Spara avläsning</button></form></html>');return;}
 if(req.method==='POST'&&url.pathname==='/ingest'){
  if(req.headers.origin!=='http://127.0.0.1:'+port){res.writeHead(403);res.end('Origin rejected');return;}
  if(importing){res.writeHead(409);res.end('Import pågår');return;} importing=true;
  try{let body='';for await(const chunk of req){body+=chunk;if(body.length>15000000)throw Error('För stor import');}
   const batch=JSON.parse(new URLSearchParams(body).get('data'));const file=path.join(root,'data/history.json');const history=mergeHistory(JSON.parse(await fs.readFile(file,'utf8')),batch);
   await fs.writeFile(file+'.tmp',JSON.stringify(history));await fs.rename(file+'.tmp',file);
   const venues=[...new Map(history.readings.map(r=>[r.url,{name:r.name,url:r.url}])).values()];await fs.writeFile(path.join(root,'data/venues.json'),JSON.stringify(venues,null,2));
   res.setHeader('Content-Type',types['.html']);res.end('<!doctype html><meta charset="utf-8"><h1>Avläsningen sparad</h1><p>'+history.readings.length+' menyavläsningar från '+venues.length+' restauranger.</p><a href="/">Öppna WoltPriser</a>');
  }finally{importing=false;}return;
 }
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const relative=decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.slice(1));
 if(relative.split('/').some(p=>p.startsWith('.')||p==='scripts')||relative.includes('\\'))throw Error('Ej tillåten sökväg');
 const target=path.resolve(root,relative);if(!target.startsWith(root))throw Error('Ej tillåten sökväg');
 res.setHeader('Content-Type',types[path.extname(target)]||'text/plain');res.end(await fs.readFile(target));
}catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Kunde inte utföra åtgärden: '+e.message);}}).listen(port,'127.0.0.1',()=>console.log('WoltPriser: http://127.0.0.1:'+port+' · import: /import'));
