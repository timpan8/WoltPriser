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
// Bilder: bara https-länkar på Wolts bildserver, sparade utan storleksparametrar.
export const IMAGE_HOST='imageproxy.wolt.com';
export function cleanImage(u){if(!u)return '';let x;try{x=new URL(String(u));}catch{throw Error('Ogiltig bildlänk.');}if(x.protocol!=='https:'||x.host!==IMAGE_HOST||x.username||x.password)throw Error('Bildlänken måste peka på '+IMAGE_HOST+'.');return x.origin+x.pathname;}
export const emptyImages=()=>({version:1,venues:{}});
// Senaste bild per restaurang + rätt-ID. Bilden ingår inte i ändringsloggen (FIELDS); en ny bildlänk räknas inte som en ändring av rätten.
export function mergeImages(store,snapshots){
 const venues={...(store?.venues||{})};
 for(const s of [...snapshots].sort((a,b)=>a.observedAt.localeCompare(b.observedAt))){
  const prev=venues[s.url];if(prev&&prev.observedAt>s.observedAt)continue;
  const items={...(prev?.items||{})};for(const i of s.items)if(i.image)items[i.id]=i.image;
  venues[s.url]={observedAt:s.observedAt,items};
 }
 return {version:1,venues};
}
export const imageFor=(store,url,id)=>store?.venues?.[url]?.items?.[id]||'';
export function validateBatch(batch){
 if(!batch||!Array.isArray(batch.snapshots)||!batch.snapshots.length||batch.snapshots.length>2000)throw Error('Avläsningar saknas eller är för många.');
 return batch.snapshots.map(s=>{
  const u=new URL(s.url);if(u.origin!=='https://wolt.com'||!/^\/sv\/swe\/stockholm\/restaurant\/[a-z0-9-]+$/.test(u.pathname))throw Error('Ogiltig restauranglänk.');
  if(!s.name||!Number.isFinite(Date.parse(s.observedAt))||Date.parse(s.observedAt)>Date.now()+300000||!Array.isArray(s.items)||!s.items.length)throw Error('Ofullständig avläsning.');
  const ids=new Set();const items=s.items.map(i=>{if(!i.id||ids.has(i.id)||!i.name||!Number.isInteger(i.price)||i.price<0||!Number.isInteger(i.originalPrice)||i.originalPrice<i.price||typeof i.available!=='boolean')throw Error('Ogiltig eller duplicerad rätt.');ids.add(i.id);return {id:String(i.id),name:String(i.name),description:String(i.description||''),category:String(i.category||''),image:cleanImage(i.image),price:i.price,originalPrice:i.originalPrice,woltPlus:!!i.woltPlus,offer:String(i.offer||''),available:i.available};});
  return {name:String(s.name),url:u.href,observedAt:new Date(s.observedAt).toISOString(),items};
 });
}
// Historik v2: en rad per avläsning och en ändringslogg per rätt. En loggpost [tid, ...FIELDS] sparas bara när rätten ändrats; [tid] betyder att rätten saknades i menyn.
const FIELDS=['name','description','category','price','originalPrice','woltPlus','offer','available'];
export const emptyHistory=()=>({version:2,readings:[],items:{}});
export const unpack=(id,e)=>Object.fromEntries([['id',id],...FIELDS.map((f,k)=>[f,e[k+1]])]);
// Samma rättobjekt återanvänds så länge loggposten är densamma (de flesta rätter ändras sällan).
export function itemHistory(times,id,log){const out=[];let p=-1,last=-2,item=null;for(const t of times){while(p+1<log.length&&log[p+1][0]<=t)p++;if(p!==last){const e=log[p];item=e&&e.length>1?unpack(id,e):null;last=p;}out.push({date:t,item});}return out;}
export function expandVenue(history,url,readings=history.readings.filter(r=>r.url===url)){
 const logs=Object.entries(history.items[url]||{}),pos=logs.map(()=>-1);
 return readings.map(r=>{const items=[];logs.forEach(([id,log],k)=>{while(pos[k]+1<log.length&&log[pos[k]+1][0]<=r.observedAt)pos[k]++;const e=log[pos[k]];if(e&&e.length>1)items.push(unpack(id,e));});return {name:r.name,url,observedAt:r.observedAt,items};});
}
function compressVenue(snapshots){
 const logs={};
 for(const s of snapshots){const seen=new Set();
  for(const i of s.items){seen.add(i.id);const e=[s.observedAt,...FIELDS.map(f=>i[f])],log=logs[i.id]??=[],last=log.at(-1);if(!last||JSON.stringify(last.slice(1))!==JSON.stringify(e.slice(1)))log.push(e);}
  for(const [id,log] of Object.entries(logs))if(!seen.has(id)&&log.at(-1).length>1)log.push([s.observedAt]);}
 return logs;
}
const groupBy=(list,key)=>{const m=new Map();for(const x of list){const k=key(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x);}return m;};
const byTime=(a,b)=>a.observedAt.localeCompare(b.observedAt)||a.url.localeCompare(b.url);
// Byter ut avläsningarna för flera restauranger på en gång (url → avläsningar; senare avläsning med samma tid vinner).
// Varje restaurang komprimeras för sig och listan över avläsningar sorteras en gång, så att det skalar till hundratals restauranger.
function replaceVenues(history,byUrl){
 const items={...history.items},fresh=[];
 for(const [url,snaps] of byUrl){const sorted=[...new Map(snaps.map(s=>[s.observedAt,s])).values()].sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
  items[url]=compressVenue(sorted);for(const s of sorted)fresh.push({url,name:s.name,observedAt:s.observedAt,items:s.items.length});}
 return {version:2,readings:[...history.readings.filter(r=>!byUrl.has(r.url)),...fresh].sort(byTime),items};
}
export function normalizeHistory(history){
 if(!Array.isArray(history))return history;
 return replaceVenues(emptyHistory(),groupBy(history,s=>s.url));
}
export function mergeHistory(history,batch){
 const h=normalizeHistory(history),byUrl=groupBy(validateBatch(batch),s=>s.url),readings=groupBy(h.readings,r=>r.url);
 for(const [url,snaps] of byUrl)byUrl.set(url,[...expandVenue(h,url,readings.get(url)||[]),...snaps]);
 return replaceVenues(h,byUrl);
}
export function latestSnapshots(history){
 const byVenue=new Map();for(const r of history.readings){if(!byVenue.has(r.url))byVenue.set(r.url,[]);byVenue.get(r.url).push(r);}
 return [...byVenue].map(([url,readings])=>{const r=readings.at(-1),times=readings.map(x=>x.observedAt);
  return {name:r.name,url,observedAt:r.observedAt,items:Object.entries(history.items[url]||{}).filter(([,log])=>log.at(-1).length>1).map(([id,log])=>({...unpack(id,log.at(-1)),timeline:itemHistory(times,id,log)}))};});
}
// Restauranger utan länk ligger kvar tills en avläsning med samma namn ger dem en.
// Övriga fält per restaurang (foodora, ubereats) följer med.
// addNew=false: lägg inte till restauranger som bara finns i historiken (skrapans upptäckta restauranger ska inte bli "dina").
export function mergeVenues(venues,history,{addNew=true}={}){
 const names=new Map();for(const r of history.readings)names.set(r.url,r.name);
 const key=s=>s.toLocaleLowerCase('sv').trim(),out=new Map();
 for(const v of venues){const url=v.url||[...names].find(([,n])=>key(n)===key(v.name))?.[0];out.set(url||'name:'+key(v.name),{...v,...(url?{name:names.get(url)??v.name,url}:{name:v.name})});}
 if(addNew)for(const [url,name] of names)if(!out.has(url))out.set(url,{name,url});
 return [...out.values()];
}
// Delar in rätter i flikar efter restaurangens menykategori och, för drycker, rättens namn.
export const COURSES=[['mat','Mat'],['frukost','Frukost & mackor'],['fika','Fika & dessert'],['dryck','Dryck'],['smatt','Tillbehör'],['barn','Barn']];
// Flik per rätt, eller null för sådant som inte är mat (bestick, påsar). Menykategorin avgör i första hand;
// rättens namn och pris används för rätter i allmänna kategorier (Kampanj, Bundles, Något extra …).
// "Chicken Sandwich" hos en hamburgerkedja är mat, och måltider med dryck ("inkl. dryck", "+ ramlösa", "-mål") är mat.
const SKIP=/^(bestick|cutlery|servetter?|sugrör|plastpåse|påse|bärkasse|kasse|ätpinnar|chopsticks|beginners chopsticks)$/i;
const KIDS_CAT=/barn|kids|king jr|minimål|junior|happy meal/i,KIDS_NAME=/^minimål|happy meal|barnmeny|kids meal|^barn/i;
const DRINK_CAT=/dryck|drinks?\b|beverage|coffee|\btea\b|kaffe|juice|smoothie|shake|shots|water|\bläsk|\bvatten|(^|\s)öl\b|\bvin\b|cocktail/i;
const VOLUME=/\b\d+([.,]\d+)?\s*(ml|cl|l)\b|\b\d+\s*oz\b/i;
const DRINK_NAME=/coca.cola|pepsi|fanta|sprite|red bull|monster|nocco|celsius|ramlösa|loka|festis|trocadero|zingo|7.?up|frap+[eu]?|frapino|iskaffe|milkshake|smoothie|kombucha|\blassi\b|ayran|bubble tea|^(latte|cappuccino|espresso|americano|macchiato|cortado|flat white|te|iste|ice tea|lemonad|läsk|mineralvatten|vatten|juice|bryggkaffe|varm choklad|chai latte)\b/i;
const MEAL=/(\b(inkl\.?|med|with|och)|\+)\s*(en\s+)?(dryck|läsk|ramlösa|drink)|mål\b|meal|combo|meny\b|& co\b/i;
const BREAKFAST_CAT=/frukost|breakfast|brunch|pancake|pannkak|gröt|porridge/i,BREAKFAST_NAME=/frukost|breakfast|brunch|acai|açaí|overnight oats|gröt\b|porridge|yoghurt|yogurt|granola|müsli/i;
const SANDWICH_CAT=/macka|mackor|smörgås|sandwich|baguette|panini|toast|fralla|frallor|bagel|ciabatta|focaccia|croque|croissant|smørrebrød/i;
const SANDWICH_NAME=/\b(sandwich|sandwiches|macka|smörgås|baguette|panini|toast|fralla|bagel|ciabatta|croque)\b|-?macka\b|smörgås|toast$/i;
// Hamburgerkedjornas "Chicken Sandwich" är burgare.
const BURGER_CAT=/burg|kyckling|chicken|classic|singel|single|deluxe|green|flexi|impossible|crispy|king|tenders/i;
const SWEET_CAT=/dessert|eft[er]*rätt|fika|kondis|bakelse|bakverk|sött|söt|treats|kanelbull|glass|ice cream|gelato|godis|tårt|kakor|cookies|donut|munk|churros/i;
const SWEET_NAME=/\b(tiramisu|brownie|cheesecake|pannacotta|panna cotta|kladdkaka|chokladboll|kanelbulle|kardemummabulle|muffin|cookie|cookies|donut|munk|churros|gelato|glass|styckglass|glasspaket|sundae|mjukglass|piggelin|magnum|baklava|semla|cupcake|macarons?|tårta|kaka|ostkaka)\b|ben & jerry|nutella|fikadeal|(äppel|blåbär|hallon|rabarber|bär|citron)paj|kaka$|tårta$/i;
const SIDE_CAT=/tillbehör|sides|\bdips?\b|dipp|såser|\bsås\b|sauces?|add.?ons?|^extras?$|^extra (?!&)|\bhome$|något extra|tilltugg|finger ?food|^bröd$|förrätt|mellanrätt|smårätt|snacks|starters?|appetizers?|antipasti|pommes|fries/i;
const MEAL_CAT=/meny|menyer|ingår|meal|mål\b/i;
const SAUCE_WORD=/(sås|sauce|dressing|\bdipp?\b|dipp$|majo|mayo|majonnäs|aioli|krydda|vinägrett|vinäger|ketchup|senap|tzatziki|bearnaise|guacamole|salsa|gräddfil|soja|soy)\b/i;
const SIDE_NAME=/^extra\b(?! long)|naan|papadam|edamame|side ?orders?|^(pommes( frites)?|fries|strips|lökringar|onion rings|coleslaw|ris|bröd|pitabröd|vitlöksbröd|dip selection|mozzarella sticks|misosoppa)$|^(?!.*\b(inkl|med|och|with|and)\b)[^+&]*\b(fries|pommes|tots)$/i;
const GENERIC=/^$|kampanj|erbjud|bundle|combo|deal|nytt|new|popul|limited|utvald|featured|meny$|lunch|special/i;
export function course(i){
 const c=String(i.category||''),n=String(i.name||'').trim(),p=i.originalPrice||i.price||0;
 if(SKIP.test(n))return null;
 if(KIDS_CAT.test(c)||KIDS_NAME.test(n))return 'barn';
 const meal=MEAL.test(n),sauce=!/\b(med|with|i)\b/i.test(n)&&SAUCE_WORD.test(n)&&(p<8000||VOLUME.test(n));
 if(DRINK_CAT.test(c)&&!meal&&!sauce)return 'dryck';
 if(SWEET_CAT.test(c))return /\b(dipp?|dipsås|topping|sås|sauce)$/i.test(n)?'smatt':'fika';
 if(BREAKFAST_CAT.test(c)||SANDWICH_CAT.test(c))return 'frukost';
 if(SIDE_CAT.test(c)&&!MEAL_CAT.test(c))return SWEET_NAME.test(n)?'fika':'smatt';
 // Allmänna kategorier: namnet (och priset) avgör.
 if(sauce)return 'smatt';
 if(!meal&&(DRINK_NAME.test(n)||VOLUME.test(n)))return 'dryck';
 if(SWEET_NAME.test(n)&&!/pizz/i.test(c))return 'fika';
 if(BREAKFAST_NAME.test(n)&&!/pizz/i.test(c)||SANDWICH_NAME.test(n)&&!/korv|hot ?dog/i.test(n)&&(GENERIC.test(c)||!meal&&!BURGER_CAT.test(c)))return 'frukost';
 if(SIDE_NAME.test(n)||p>0&&p<2000)return 'smatt';
 return 'mat';
}
// Dryckens volym i ml ur namnet: "33 cl", "1,5 L", "330ml", "16oz", "6 x 33 cl", "4-pack 33cl". null om okänd.
export function volumeMl(name){
 const t=String(name??'').toLowerCase().replace(/(\d),(\d)/g,'$1.$2'),m=t.match(/(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|liter|oz)\b/);if(!m)return null;
 const one=Number(m[1])*{ml:1,cl:10,dl:100,l:1000,liter:1000,oz:29.57}[m[2]];if(!(one>=50&&one<=5000))return null;
 const n=Number(t.match(/(\d+)\s*(?:x|×)\s*\d/)?.[1]||t.match(/(\d+)\s*-?\s*pack\b/)?.[1]||1);
 return Math.round(one*(n>=1&&n<=24?n:1));
}
// Hur bra erbjudandet är: 3 ovanligt billigt, 2 kampanj, 1 nytt lägsta eller sänkt pris, 0 inget.
export function deal(item,price,stats){
 if(stats.unusual)return {level:3,label:'Ovanligt billigt',pct:stats.discount,save:Math.round(stats.median-price)};
 if(price<item.originalPrice){const pct=Math.round((1-price/item.originalPrice)*100);return {level:2,label:`Kampanj −${pct} %`,pct,save:item.originalPrice-price};}
 if(stats.lowest)return {level:1,label:'Nytt lägsta pris',pct:0,save:stats.last===null?0:stats.last-price};
 if(stats.change<0)return {level:1,label:'Sänkt pris',pct:0,save:-stats.change};
 return {level:0,label:'',pct:0,save:0};
}
