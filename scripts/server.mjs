import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {emptyHistory} from '../lib/prices.mjs';
import {saveSnapshots} from '../lib/store.mjs';
import {mergeReceipts,emptyReceipts} from '../lib/receipts.mjs';
import {mergeFoodora,emptyFoodora} from '../lib/foodora.mjs';
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
   const batch=JSON.parse(new URLSearchParams(body).get('data'));
   if(batch&&Array.isArray(batch.foodora)){const ffile=path.join(root,'data/foodora.json');let store=emptyFoodora();try{store=JSON.parse(await fs.readFile(ffile,'utf8'));}catch{}
    store=mergeFoodora(store,batch);await fs.writeFile(ffile+'.tmp',JSON.stringify(store));await fs.rename(ffile+'.tmp',ffile);
    res.setHeader('Content-Type',types['.html']);res.end('<!doctype html><meta charset="utf-8"><h1>Foodora-priser sparade</h1><p>'+Object.keys(store.venues).length+' restauranger med Foodora-priser.</p><a href="/">Öppna WoltPriser</a>');return;}
   if(batch&&Array.isArray(batch.receipts)){const rfile=path.join(root,'data/receipts.json');let store=emptyReceipts();try{store=JSON.parse(await fs.readFile(rfile,'utf8'));}catch{}
    store=mergeReceipts(store,batch);await fs.writeFile(rfile+'.tmp',JSON.stringify(store,null,1));await fs.rename(rfile+'.tmp',rfile);
    res.setHeader('Content-Type',types['.html']);res.end('<!doctype html><meta charset="utf-8"><h1>Kvitton sparade</h1><p>'+store.prices.length+' kvittopriser totalt.</p><a href="/">Öppna WoltPriser</a>');return;}
   const {history,venues}=await saveSnapshots(root,batch);
   res.setHeader('Content-Type',types['.html']);res.end('<!doctype html><meta charset="utf-8"><h1>Avläsningen sparad</h1><p>'+history.readings.length+' menyavläsningar från '+venues.filter(v=>v.url).length+' restauranger.</p><a href="/">Öppna WoltPriser</a>');
  }finally{importing=false;}return;
 }
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const relative=decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.slice(1));
 if(relative.split('/').some(p=>p.startsWith('.')||p==='scripts')||relative.includes('\\'))throw Error('Ej tillåten sökväg');
 const target=path.resolve(root,relative);if(!target.startsWith(root))throw Error('Ej tillåten sökväg');
 res.setHeader('Content-Type',types[path.extname(target)]||'text/plain');res.end(await fs.readFile(target));
}catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Kunde inte utföra åtgärden: '+e.message);}}).listen(port,'127.0.0.1',()=>console.log('WoltPriser: http://127.0.0.1:'+port+' · import: /import'));
