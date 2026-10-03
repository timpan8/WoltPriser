// Kärnan i den schemalagda insamlingen. Nätverket injiceras så att allt kan testas utan Wolt.
import {sourceFor,defaultSource} from './sources/index.mjs';
import {fetchUberEats,findUberEats,pickStore,linkFor,snapshotFrom} from './sources/ubereats.mjs';
import {latestSnapshots,analyze} from './prices.mjs';
import {freshMemberPrices} from './member.mjs';

const TZ='Europe/Stockholm';
const local=(iso)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,hour:+p.hour};};

// Dags att läsa av? Efter dueHour lokal tid och ingen avläsning gjord efter dueHour i dag.
// Gör att GitHubs UTC-schema kan köras två gånger (sommar/vinter) och att försenade körningar fungerar.
export function isDue(history,now=new Date().toISOString(),dueHour=16){
 const n=local(now);if(n.hour<dueHour)return false;
 return !history.readings.some(r=>{const l=local(r.observedAt);return l.date===n.date&&l.hour>=dueHour;});
}

// Rimlighetskontroll mot förra avläsningen: tom meny eller tapp > 30 % räknas som fel.
export function checkSnapshot(snapshot,previousCount){
 if(!snapshot.items.length)return 'tom meny';
 if(previousCount&&snapshot.items.length<previousCount*0.7)return `bara ${snapshot.items.length} rätter mot ${previousCount} förra gången`;
 return '';
}

const lastCount=(history,url)=>history.readings.filter(r=>r.url===url).at(-1)?.items||0;

// Wolt+-kampanjer syns bara för inloggade medlemmar. Rätter som förra avläsningen hade Wolt+-pris men som nu
// har fullpris räknas upp i en varning, så att en saknad Wolt+-rabatt inte tas för en riktig prishöjning.
export function lostWoltPlus(history,snapshot,mine=new Set()){
 const prev=latestSnapshots(history).find(s=>s.url===snapshot.url);if(!prev)return [];
 const now=new Map(snapshot.items.map(i=>[i.id,i]));
 return prev.items.filter(p=>{const n=now.get(p.id);return p.woltPlus&&p.price<p.originalPrice&&n&&!n.woltPlus&&n.price>=n.originalPrice&&!mine.has(snapshot.url+'|'+p.id);}).map(p=>p.name);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function pool(list,size,fn){const out=new Array(list.length);let next=0;
 await Promise.all(Array.from({length:Math.min(size,list.length)},async()=>{while(next<list.length){const k=next++;out[k]=await fn(list[k],k);}}));return out;}

export async function scrapeAll({venues,history,member=null,lat,lon,concurrency=2,fetchImpl,now,retryDelay=5000,pause=()=>sleep(1000+Math.random()*1500),log=()=>{}}){
 const ctx={lat,lon,fetchImpl,now};
 const results=await pool(venues,concurrency,async venue=>{
  try{
   let v=venue;
   if(!v.url){const hit=await defaultSource.search(v.name,ctx);if(!hit)return {venue,error:`ingen entydig träff på ${defaultSource.label}`};v={...v,...hit};}
   const source=sourceFor(v.url);if(!source)return {venue,error:'okänd plattform'};
   const prev=lastCount(history,v.url);
   let {snapshot,warning}=await source.fetchSnapshot(v,ctx);let problem=checkSnapshot(snapshot,prev);
   if(problem){log(`${v.name}: ${problem}, försöker igen`);await sleep(retryDelay);({snapshot,warning}=await source.fetchSnapshot(v,ctx));problem=checkSnapshot(snapshot,prev);}
   await pause();
   if(problem)return {venue:v,error:problem};
   const lost=lostWoltPlus(history,snapshot,freshMemberPrices(member,snapshot.observedAt)),warnings=[warning,snapshot.items.some(i=>i.image)?'':'inga bilder',lost.length?`${lost.length} Wolt+-priser saknas (t.ex. ${lost.slice(0,2).join(', ')})`:''].filter(Boolean);
   log(`${v.name}: ${snapshot.items.length} rätter${warnings.length?' ('+warnings.join(', ')+')':''}`);
   return {venue:v,snapshot,warnings,source:source.id};
  }catch(e){return {venue,error:e.message};}
 });
 return {ok:results.filter(r=>r.snapshot),failed:results.filter(r=>r.error)};
}

// Ovanligt låga priser i de nya avläsningarna (samma regel som sidan: ≥ 20 % under medianen, minst 7 dagar).
export function unusualDeals(history,urls,plus=false){
 const out=[];
 for(const s of latestSnapshots(history)){if(!urls.has(s.url))continue;
  for(const i of s.items){if(!i.available)continue;const a=analyze(i.timeline,i,plus,s.observedAt);if(a.unusual)out.push({venue:s.name,url:s.url,name:i.name,price:a.points.at(-1).price,median:a.median,discount:a.discount});}}
 return out.sort((a,b)=>b.discount-a.discount);
}

// Restauranger att läsa: dina (venues.json) först, sedan upptäckta som inte redan finns. Dubbletter tas bort via länk.
export function scrapeList(mine,discovered=[]){
 const seen=new Set(mine.filter(v=>v.url).map(v=>v.url));
 return [...mine,...discovered.filter(v=>v.url&&!seen.has(v.url)&&seen.add(v.url)).map(({name,url})=>({name,url,discovered:true}))];
}

// Standardposition: Årsta (postnummer 120 53, runt Årsta torg). WOLT_LAT/WOLT_LON går före.
export const DEFAULT_POS={lat:59.299,lon:18.052};

// Uber Eats för alla restauranger som läses på Wolt. Länken tas från venues.json (fältet ubereats) eller från
// data/ubereats-links.json; saknas den söks restaurangen upp med namnet (högst searchLimit sökningar per körning,
// och en restaurang utan träff söks igen först efter recheckDays dagar). Tom meny eller tapp > 30 % mot förra
// avläsningen räknas som fel; då behålls gamla priser. Om Uber Eats blockerar (HTTP 403 eller en kontrollsida)
// avbryts resten av Uber Eats-läsningen och blocked sätts; då gäller webbläsarreserven (AUTOMATION.md).
const BLOCKED=/HTTP 403|kontrollsida/;
const prevCount=(store,wolt)=>{const v=store?.venues?.[wolt];return v?Object.values(v.items).filter(i=>i.seen===v.observedAt).length:0;};
export const emptyLinks=()=>({version:1,links:{}});
export async function scrapeUberEats({venues,store,links=emptyLinks(),lat=DEFAULT_POS.lat,lon=DEFAULT_POS.lon,searchLimit=80,recheckDays=14,fetchImpl,now,pause=()=>sleep(1000+Math.random()*1500),log=()=>{}}){
 const t=now||new Date().toISOString(),map={...(links?.links||{})};let searched=0,found=0,blocked=null;
 const due=e=>!e||(!e.ubereats&&Date.parse(t)-Date.parse(e.checkedAt)>recheckDays*864e5);
 const results=await pool(venues.filter(v=>v.url),2,async v=>{
  const link=v.ubereats||map[v.url]?.ubereats;
  if(blocked)return null;
  if(!link&&(!due(map[v.url])||searched>=searchLimit))return null;
  try{let snapshot;
   if(link)snapshot=await fetchUberEats({...v,ubereats:link},{fetchImpl,now});
   else{searched++;const hit=await findUberEats(v,{lat,lon,fetchImpl,pause});await pause();
    map[v.url]={ubereats:hit?.url||null,checkedAt:t};if(!hit)return null;
    found++;log(`${v.name}: hittad på Uber Eats (${hit.store.title})`);snapshot=snapshotFrom(hit.store,v,hit.url,now);}
   await pause();
   const problem=checkSnapshot(snapshot,prevCount(store,v.url));if(problem)return {venue:v,error:problem};
   log(`${v.name} (Uber Eats): ${snapshot.items.length} rätter`);return {venue:v,snapshot};
  }catch(e){if(BLOCKED.test(e.message)){blocked??=e.message;return null;}return {venue:v,error:e.message,search:!link};}});
 const done=results.filter(Boolean);
 return {ok:done.filter(r=>r.snapshot),failed:done.filter(r=>r.error),links:{version:1,links:map},searched,found,blocked};
}

// Reserv från din inloggade webbläsare (scripts/extract-ubereats.js): samma val av butik och samma rimlighetskontroll.
// list: [{wolt, name, ubereats?, stores:[butiksdata]} | {wolt, name, error}].
export function ingestUberEats(list,{store,links=emptyLinks(),lat=DEFAULT_POS.lat,lon=DEFAULT_POS.lon,now}={}){
 if(!Array.isArray(list))throw Error('Uber Eats-läsningen saknas.');
 const t=now||new Date().toISOString(),map={...(links?.links||{})},ok=[],failed=[];
 for(const r of list){const v={name:String(r?.name||''),url:r?.wolt};
  try{if(r.error)throw Error(String(r.error));
   const stores=(r.stores||[]).map(s=>s?.data||s).filter(Boolean);
   const picked=r.ubereats?stores[0]:pickStore({name:v.name,stores,lat,lon});
   if(!r.ubereats)map[v.url]={ubereats:picked?linkFor(picked):null,checkedAt:t};
   if(!picked)continue;
   const snapshot=snapshotFrom(picked,v,r.ubereats||linkFor(picked),r.observedAt||now);
   const problem=checkSnapshot(snapshot,prevCount(store,v.url));if(problem)throw Error(problem);
   ok.push({venue:v,snapshot});
  }catch(e){failed.push({venue:v,error:e.message});}
 }
 return {ok,failed,links:{version:1,links:map}};
}
