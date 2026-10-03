// Kärnan i den schemalagda insamlingen. Nätverket injiceras så att allt kan testas utan Wolt.
import {sourceFor,defaultSource} from './sources/index.mjs';
import {fetchUberEats} from './sources/ubereats.mjs';
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

// Uber Eats för restauranger med fältet ubereats i venues.json. Tom meny eller tapp > 30 % mot förra
// avläsningen räknas som fel; då behålls gamla priser.
export async function scrapeUberEats({venues,store,fetchImpl,now,pause=()=>sleep(1000+Math.random()*1500),log=()=>{}}){
 const prevCount=wolt=>{const v=store?.venues?.[wolt];return v?Object.values(v.items).filter(i=>i.seen===v.observedAt).length:0;};
 const results=await pool(venues.filter(v=>v.url&&v.ubereats),2,async v=>{
  try{const snapshot=await fetchUberEats(v,{fetchImpl,now});await pause();
   const problem=checkSnapshot(snapshot,prevCount(v.url));if(problem)return {venue:v,error:problem};
   log(`${v.name} (Uber Eats): ${snapshot.items.length} rätter`);return {venue:v,snapshot};
  }catch(e){return {venue:v,error:e.message};}});
 return {ok:results.filter(r=>r.snapshot),failed:results.filter(r=>r.error)};
}
