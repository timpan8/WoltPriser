export const money = n => new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK',maximumFractionDigits:2}).format(n/100);
export const seafood = i => /fisk|skaldjur|räk|lax|tonfisk|ansjovis|sardell|mussl|bläckfisk|scampi|gamber|tonno|surimi|bonito|fish|shrimp|prawn|salmon|tuna|oyster|ostron|dashi|kaviar|romsås/i.test(i.name+' '+i.description);
export const extra = i => /dryck|drinks|beverages|tillbehör|sides|dipp|dips|dessert|efterrätt|förrätt|bröd|snacks|barn|kaffe|coffee|bakverk|fika|shake|juices?|smoothie|shots|water|såser|extra|add-ons|kids|king jr|minimål|kanelbull|kondisbitar/i.test(i.category) || /\b\d+\s*(ml|cl)\b|extra |naan|papadam|coca.cola|pepsi|fanta|sprite|red bull/i.test(i.name);
export function effectivePrice(i,plus){return i.woltPlus&&!plus?i.originalPrice:i.price;}
export function analyze(timeline,item,plus,now){
 const previous=timeline.filter(s=>s.date<now&&s.item&&s.item.available);
 const currentDate=new Date(now),cutoff=currentDate.getTime()-30*86400000;
 const points=previous.map(s=>({date:s.date,price:effectivePrice(s.item,plus)}));
 const daily=new Map();for(const p of points)if(new Date(p.date).getTime()>=cutoff&&p.date.slice(0,10)!==now.slice(0,10))daily.set(p.date.slice(0,10),p.price);
 const values=[...daily.values()].sort((a,b)=>a-b);const median=values.length?values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2:null;
 const price=effectivePrice(item,plus),last=points.at(-1)?.price??null;
 const discount=median?Math.round((1-price/median)*100):null;
 return {points:[...points,{date:now,price}],last,change:last===null?null:price-last,median,days:daily.size,unusual:daily.size>=7&&discount>=20,discount,lowest:points.length>0&&price<Math.min(...points.map(p=>p.price))};
}
export function validateBatch(batch){
 if(!batch||!Array.isArray(batch.snapshots)||!batch.snapshots.length||batch.snapshots.length>100)throw Error('Avläsningar saknas eller är för många.');
 return batch.snapshots.map(s=>{
  const u=new URL(s.url);if(u.origin!=='https://wolt.com'||!/^\/sv\/swe\/stockholm\/restaurant\/[a-z0-9-]+$/.test(u.pathname))throw Error('Ogiltig restauranglänk.');
  if(!s.name||!Number.isFinite(Date.parse(s.observedAt))||Date.parse(s.observedAt)>Date.now()+300000||!Array.isArray(s.items)||!s.items.length)throw Error('Ofullständig avläsning.');
  const ids=new Set();const items=s.items.map(i=>{if(!i.id||ids.has(i.id)||!i.name||!Number.isInteger(i.price)||i.price<0||!Number.isInteger(i.originalPrice)||i.originalPrice<i.price||typeof i.available!=='boolean')throw Error('Ogiltig eller duplicerad rätt.');ids.add(i.id);return {id:String(i.id),name:String(i.name),description:String(i.description||''),category:String(i.category||''),price:i.price,originalPrice:i.originalPrice,woltPlus:!!i.woltPlus,offer:String(i.offer||''),available:i.available};});
  return {name:String(s.name),url:u.href,observedAt:new Date(s.observedAt).toISOString(),items};
 });
}
// Historik v2: en rad per avläsning och en ändringslogg per rätt. En loggpost [tid, ...FIELDS] sparas bara när rätten ändrats; [tid] betyder att rätten saknades i menyn.
const FIELDS=['name','description','category','price','originalPrice','woltPlus','offer','available'];
export const emptyHistory=()=>({version:2,readings:[],items:{}});
export const unpack=(id,e)=>Object.fromEntries([['id',id],...FIELDS.map((f,k)=>[f,e[k+1]])]);
export function itemHistory(times,id,log){const out=[];let p=-1;for(const t of times){while(p+1<log.length&&log[p+1][0]<=t)p++;const e=log[p];out.push({date:t,item:e&&e.length>1?unpack(id,e):null});}return out;}
export function expandVenue(history,url){
 const readings=history.readings.filter(r=>r.url===url),logs=Object.entries(history.items[url]||{}),pos=logs.map(()=>-1);
 return readings.map(r=>{const items=[];logs.forEach(([id,log],k)=>{while(pos[k]+1<log.length&&log[pos[k]+1][0]<=r.observedAt)pos[k]++;const e=log[pos[k]];if(e&&e.length>1)items.push(unpack(id,e));});return {name:r.name,url,observedAt:r.observedAt,items};});
}
function compressVenue(snapshots){
 const logs={};
 for(const s of snapshots){const seen=new Set();
  for(const i of s.items){seen.add(i.id);const e=[s.observedAt,...FIELDS.map(f=>i[f])],log=logs[i.id]??=[],last=log.at(-1);if(!last||JSON.stringify(last.slice(1))!==JSON.stringify(e.slice(1)))log.push(e);}
  for(const [id,log] of Object.entries(logs))if(!seen.has(id)&&log.at(-1).length>1)log.push([s.observedAt]);}
 return logs;
}
function withSnapshots(history,url,snapshots){
 const sorted=[...new Map(snapshots.map(s=>[s.observedAt,s])).values()].sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
 const readings=[...history.readings.filter(r=>r.url!==url),...sorted.map(s=>({url,name:s.name,observedAt:s.observedAt,items:s.items.length}))].sort((a,b)=>a.observedAt.localeCompare(b.observedAt)||a.url.localeCompare(b.url));
 return {version:2,readings,items:{...history.items,[url]:compressVenue(sorted)}};
}
export function normalizeHistory(history){
 if(!Array.isArray(history))return history;
 let h=emptyHistory();for(const url of new Set(history.map(s=>s.url)))h=withSnapshots(h,url,history.filter(s=>s.url===url));return h;
}
export function mergeHistory(history,batch){
 let h=normalizeHistory(history);const incoming=validateBatch(batch);
 for(const url of new Set(incoming.map(s=>s.url)))h=withSnapshots(h,url,[...expandVenue(h,url),...incoming.filter(s=>s.url===url)]);
 return h;
}
export function latestSnapshots(history){
 const byVenue=new Map();for(const r of history.readings){if(!byVenue.has(r.url))byVenue.set(r.url,[]);byVenue.get(r.url).push(r);}
 return [...byVenue].map(([url,readings])=>{const r=readings.at(-1),times=readings.map(x=>x.observedAt);
  return {name:r.name,url,observedAt:r.observedAt,items:Object.entries(history.items[url]||{}).filter(([,log])=>log.at(-1).length>1).map(([id,log])=>({...unpack(id,log.at(-1)),timeline:itemHistory(times,id,log)}))};});
}
