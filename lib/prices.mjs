export const money = n => new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK',maximumFractionDigits:2}).format(n/100);
export const seafood = i => /fisk|skaldjur|räk|lax|tonfisk|ansjovis|sardell|mussl|bläckfisk|scampi|gamber|tonno|surimi|bonito|fish|shrimp|prawn|salmon|tuna|oyster|ostron|dashi|kaviar|romsås/i.test(i.name+' '+i.description);
export const extra = i => /dryck|drinks|beverages|tillbehör|sides|dipp|dips|dessert|efterrätt|förrätt|bröd|snacks|barn|kaffe|coffee|bakverk|fika|shake|juices?|smoothie|shots|water|såser|extra|add-ons|kids|king jr|minimål|kanelbull|kondisbitar/i.test(i.category) || /\b\d+\s*(ml|cl)\b|extra |naan|papadam|coca.cola|pepsi|fanta|sprite|red bull/i.test(i.name);
export function effectivePrice(i,plus){return i.woltPlus&&!plus?i.originalPrice:i.price;}
export function analyze(history,current,plus,now){
 const all=history.filter(s=>s.url===current.url).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
 const currentDate=new Date(now),cutoff=currentDate.getTime()-30*86400000;
 const previous=all.filter(s=>s.observedAt<now).map(s=>({date:s.observedAt,item:s.items.find(i=>i.id===current.item.id)})).filter(s=>s.item&&s.item.available);
 const points=previous.map(s=>({date:s.date,price:effectivePrice(s.item,plus)}));
 const daily=new Map();for(const p of points)if(new Date(p.date).getTime()>=cutoff&&p.date.slice(0,10)!==now.slice(0,10))daily.set(p.date.slice(0,10),p.price);
 const values=[...daily.values()].sort((a,b)=>a-b);const median=values.length?values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2:null;
 const price=effectivePrice(current.item,plus),last=points.at(-1)?.price??null;
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
export function mergeHistory(history,batch){const incoming=validateBatch(batch),map=new Map(history.map(s=>[s.url+'|'+s.observedAt,s]));for(const s of incoming)map.set(s.url+'|'+s.observedAt,s);return [...map.values()].sort((a,b)=>a.observedAt.localeCompare(b.observedAt));}
