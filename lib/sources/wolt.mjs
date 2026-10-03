// Wolt-källa: hämtar menyn från Wolts öppna JSON-API (samma anrop som wolt.com gör utan inloggning).
// assortment = rätter, kategorier, ordinarie priser, bilder och tillgänglighet.
// dynamic    = restaurangens aktiva kampanjer (rabatt per rätt, "köp 3 betala för 2" m.m.).
// mapWolt är ren och testbar; fetchWolt/searchWolt gör nätverksanropen.

const API='https://consumer-api.wolt.com';
const EXCLUDED_CATEGORIES=['Populärt','Nyligen köpta varor'];
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();

export const matches=url=>{try{return new URL(url).host==='wolt.com';}catch{return false;}};
export const slugFromUrl=url=>new URL(url).pathname.split('/').filter(Boolean).at(-1);
export const venueUrl=slug=>`https://wolt.com/sv/swe/stockholm/restaurant/${slug}`;

// API:t ger wolt-menu-images-cdn.wolt.com/menu-images/...; sidan använder imageproxy.wolt.com/menu/menu-images/... (samma bild, skalbar med ?w=).
export function imageUrl(u){
 if(!u)return '';
 try{const x=new URL(u);
  if(x.host==='imageproxy.wolt.com')return x.origin+x.pathname;
  if(x.host==='wolt-menu-images-cdn.wolt.com')return 'https://imageproxy.wolt.com/menu'+x.pathname;
 }catch{}
 return '';
}

// Lokal tid i Stockholm: veckodag (1 = måndag … 7 = söndag) och millisekunder sedan midnatt.
export function localClock(now,timeZone='Europe/Stockholm'){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.weekday)+1;
 const ms=((+p.hour*60+ +p.minute)*60+ +p.second)*1000;
 return {day,ms,minuteOfWeek:(day-1)*1440+Math.floor(ms/60000)};
}

const inAvailableTimes=(times,clock)=>!times?.length||times.some(t=>t.days?.includes(clock.day)&&clock.ms>=t.start_time&&clock.ms<t.end_time);
const inWeeklyWindow=(windows,clock)=>!windows?.length||windows.some(w=>clock.minuteOfWeek>=w.start&&clock.minuteOfWeek<w.end);

// Kampanjer som gäller vid hemleverans just nu.
function activeDiscounts(dynamic,clock){
 return (dynamic?.venue_raw?.discounts||[]).filter(d=>{const c=d.conditions||{};
  return (!c.delivery_methods||c.delivery_methods.includes('homedelivery'))&&inWeeklyWindow(c.weekly_time_restrictions,clock);});
}
const covers=(sel,id,cats)=>!!sel&&((sel.items||[]).includes(id)||(sel.categories||[]).some(c=>cats.has(c)));

export function mapWolt({assortment,dynamic,url,name,now=new Date().toISOString()}){
 if(!assortment||!Array.isArray(assortment.items))throw Error('Wolt-svaret saknar rätter.');
 const clock=localClock(now);
 // Kategori per rätt som i DOM-läsningen: senaste kategorin vinner, utom Populärt/Nyligen köpta.
 const categoryName=new Map(),categoryIds=new Map();
 const walk=(cats,parent)=>{for(const c of cats||[]){const label=clean(parent?.name??c.name);
  for(const id of c.item_ids||[]){if(!categoryIds.has(id))categoryIds.set(id,new Set());categoryIds.get(id).add(c.id);if(parent)categoryIds.get(id).add(parent.id);
   if(!categoryName.has(id)||!EXCLUDED_CATEGORIES.includes(label))categoryName.set(id,label);}
  walk(c.subcategories,parent??c);}};
 walk(assortment.categories);
 const discounts=activeDiscounts(dynamic,clock);
 const items=[];
 for(const i of assortment.items){
  if(!i?.id||!Number.isInteger(i.price)||i.price<0)continue;
  const cats=categoryIds.get(i.id)||new Set();
  const base=i.price,listed=Number.isInteger(i.original_price)&&i.original_price>base?i.original_price:base;
  let best=null;
  for(const d of discounts){const e=d.effects?.item_discount;if(!e||e.include?.cheapest_items||!covers(e.include,i.id,cats)||covers(e.exclude,i.id,cats))continue;
   let amount=e.fraction!=null?Math.round(base*e.fraction):(e.amount_per_item??0);
   if(e.max_amount_per_item!=null)amount=Math.min(amount,e.max_amount_per_item);
   if(amount>0&&(!best||amount>best.amount))best={amount,d};}
  // Kampanjer utan prisändring per rätt (t.ex. köp 3, betala för 2) visas bara som text.
  const promo=best?.d||discounts.find(d=>!d.effects?.basket_discount&&!d.effects?.item_discount&&(covers(d.effects?.free_items?.include,i.id,cats)||(d.conditions?.basket_contains||[]).some(b=>(b.any_of_items||[]).includes(i.id)||(b.items_from_categories||[]).some(c=>cats.has(c)))));
  items.push({
   id:String(i.id),name:clean(i.name),description:clean(i.description),category:categoryName.get(i.id)||'',
   image:imageUrl(i.images?.[0]?.url),
   price:Math.max(0,base-(best?.amount||0)),originalPrice:listed,
   woltPlus:!!(i.is_wolt_plus_only||best?.d?.conditions?.has_wolt_plus===true),
   offer:clean(promo?.description?.title),
   available:!i.disabled_info&&inAvailableTimes(i.available_times,clock),
  });
 }
 return {observedAt:new Date(now).toISOString(),name:clean(name),url,items};
}

// Nätverk ----------------------------------------------------------------------------------------
const HEADERS={'accept':'application/json','app-language':'sv','user-agent':process.env.SCRAPER_USER_AGENT||'WoltPriser/1.0 (+https://github.com/timpan8/WoltPriser)'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function getJson(url,{fetchImpl=fetch,init={},tries=4,backoff=4000}={}){
 for(let n=1;;n++){
  let res;try{res=await fetchImpl(url,{...init,headers:{...HEADERS,...init.headers},signal:AbortSignal.timeout(20000)});}
  catch(e){if(n>=tries)throw Error(`Nätverksfel: ${e.message}`);await sleep(backoff*n);continue;}
  if(res.ok){const t=await res.text();try{return JSON.parse(t);}catch{throw Error(`${new URL(url).host} svarade inte med JSON (troligen en kontrollsida mot robotar)`);}}
  if(n>=tries||![429,500,502,503,504].includes(res.status))throw Error(`HTTP ${res.status} från ${new URL(url).host}`);
  await sleep(Number(res.headers.get('retry-after'))*1000||backoff*2**(n-1));
 }
}

// Restaurangens betyg (0–10) ur venue-svaret, om det finns. Läses tåligt: första rating med numerisk score.
export function venueRating(json){
 let found=null;const walk=(o,d=0)=>{if(found!==null||!o||typeof o!=='object'||d>6)return;
  if(o.rating&&typeof o.rating==='object'&&typeof o.rating.score==='number'&&o.rating.score>0&&o.rating.score<=10){found=o.rating.score;return;}
  for(const v of Object.values(o))walk(v,d+1);};
 walk(json);return found;
}
export async function fetchWolt(venue,{lat,lon,fetchImpl,now}={}){
 const slug=slugFromUrl(venue.url);
 const assortment=await getJson(`${API}/consumer-api/consumer-assortment/v1/venues/slug/${slug}/assortment`,{fetchImpl});
 if(assortment.loading_strategy&&assortment.loading_strategy!=='full')throw Error(`Menyn levereras i delar (${assortment.loading_strategy}); stöds inte än.`);
 // Kampanjer krävs: utan dem kan ett rabatterat pris sparas som ordinarie. Hellre misslyckad restaurang än fel pris.
 let dynamic;
 try{dynamic=await getJson(`${API}/order-xp/web/v1/venue/slug/${slug}/dynamic/?lat=${lat}&lon=${lon}&selected_delivery_method=homedelivery`,{fetchImpl});}
 catch(e){throw Error('kampanjer kunde inte läsas ('+e.message+')');}
 // Venue-sidans statiska data: betyg, öppettider och minsta order. Ett fel här stoppar aldrig avläsningen.
 let stat=null;try{stat=await getJson(`${API}/order-xp/web/v1/venue/slug/${slug}/static/`,{fetchImpl,tries:1});}catch{}
 const vs=venueInfo(stat),vd=venueInfo(dynamic),info={hours:vd.hours??vs.hours,minOrder:vd.minOrder??vs.minOrder,sample:vd.sample??vs.sample};
 const rating=venueRating(dynamic)??venueRating(stat)??venueRating(assortment)??await searchRating(slug,venue.name,{lat,lon,fetchImpl});
 const vp=venuePlace(stat),vq=vp.address&&vp.pos?vp:venuePlace(dynamic),place={address:vp.address??vq.address,pos:vp.pos??vq.pos};
 return {snapshot:mapWolt({assortment,dynamic,url:venueUrl(slug),name:venue.name,now}),warning:'',rating,hours:info.hours??null,minOrder:info.minOrder??null,place,
  debug:info.hours?null:[...(info.sample?['okänt format: '+info.sample]:[]),...infoKeys([stat,dynamic])]};
}
// Restaurangens adress och position ur venue-svaret (för att hitta samma ställe på Google). Läses tåligt;
// i Sverige är latituden alltid större än longituden, vilket avgör ordningen i koordinatlistor.
// Adress och position direkt på ett venue-objekt i restauranglistan (address, location [lon,lat]); tomt om de saknas.
function placeOf(o){const p=venuePlace({address:o.address,location:o.location});return {...(p.address?{address:p.address}:{}),...(p.pos?{pos:p.pos}:{})};}
export function venuePlace(json){
 let address=null,pos=null;const walk=(o,d=0)=>{if(!o||typeof o!=='object'||d>6||(address&&pos))return;
  for(const [k,v] of Object.entries(o)){
   if(!address&&/^(address|street_address)$/i.test(k)&&typeof v==='string'&&/\d/.test(v)&&v.length<120)address=v.trim();
   if(!pos&&/^(location|coordinates)$/i.test(k)&&v&&typeof v==='object'){const c=Array.isArray(v)?v:Array.isArray(v.coordinates)?v.coordinates:null;
    const p=c&&c.length===2?(c[1]>c[0]?{lat:c[1],lon:c[0]}:{lat:c[0],lon:c[1]}):{lat:v.lat??v.latitude,lon:v.lon??v.lng??v.longitude};
    if(Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&p.lat>p.lon)pos=p;}
   if(v&&typeof v==='object')walk(v,d+1);}};
 walk(json);return {address,pos};
}
const DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
// "HH:MM", millisekunder sedan midnatt (även {$date: ms}) eller minuter → minuter sedan midnatt.
function minutes(v){
 if(v&&typeof v==='object')v=v.$date??v.value??v.time;
 if(typeof v==='string'){const m=v.match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}
 if(typeof v==='number')return v>=86400?Math.round(v/60000):v<=2880?v:null;
 return null;
}
// En dags tider i något av Wolts format → [[öppnar, stänger]] i minuter (stänger > 1440 om efter midnatt).
// type/value-formatet (Wolts delivery_times) anger sekunder efter midnatt; en öppning utan stängning stängs av nästa dags första 'close'.
const secs=v=>typeof v==='number'?(v>=0&&v<=172800?Math.round(v/60):null):minutes(v);
function dayRanges(list,next){
 if(!Array.isArray(list))return null;const out=[];let open=null;
 for(const e of list){if(!e||typeof e!=='object')continue;
  const o=minutes(e.open??e.start??e.opening_time??e.from),c=minutes(e.close??e.end??e.closing_time??e.to);
  if(o!=null&&c!=null){out.push([o,c<=o?c+1440:c]);continue;}
  const t=String(e.type||'').toLowerCase(),m=secs(e.value??e.time);if(m==null)continue;
  if(t==='open')open=m;else if(t==='close'&&open!=null){out.push([open,m<=open?m+1440:m]);open=null;}}
 if(open!=null&&Array.isArray(next)){const c=next.find(e=>String(e?.type||'').toLowerCase()==='close'),m=c&&secs(c.value??c.time);
  if(m!=null&&next.indexOf(c)===next.findIndex(e=>e?.type))out.push([open,m+1440]);}
 return out;
}
// Öppettider (leveranstider i första hand) och minsta ordervärde ur ett Wolt-svar. Läses tåligt.
export function venueInfo(json){
 let hours=null,minOrder=null,sample=null;
 const walk=(o,d=0)=>{if(!o||typeof o!=='object'||d>8)return;
  for(const [k,v] of Object.entries(o)){
   if(/^(delivery_times|opening_times|opening_hours|delivery_hours)$/i.test(k)&&v&&typeof v==='object'&&!Array.isArray(v)&&DAYS.some(dd=>dd in v)){
    const h={};for(const [i,dd] of DAYS.entries()){const r=dayRanges(v[dd],v[DAYS[(i+1)%7]]);if(r?.length)h[dd.slice(0,3)]=r;}
    if(Object.keys(h).length&&(!hours||/delivery/i.test(k)))hours=h;
    else if(!Object.keys(h).length&&!sample)sample=k+'.'+DAYS.find(dd=>dd in v)+'='+JSON.stringify(v[DAYS.find(dd=>dd in v)]).slice(0,300);}
   if(minOrder==null&&/^(order_minimum_no_surcharge|minimum_order(_amount)?|min_order(_amount)?|order_minimum)$/i.test(k)&&typeof v==='number'&&v>0&&v<100000)minOrder=Math.round(v);
   if(v&&typeof v==='object')walk(v,d+1);}};
 walk(json);return {hours,minOrder,sample};
}
// Diagnostik när öppettider saknas: nycklar som ser ut att handla om tider.
export function infoKeys(list){const out=new Set();const walk=(o,p,d)=>{if(!o||typeof o!=='object'||d>5)return;for(const [k,v] of Object.entries(o)){const q=p?p+'.'+k:k;if(/open|hour|time|schedul|minimum/i.test(k))out.add(q+(Array.isArray(v)?'[]':typeof v==='object'&&v?'{'+Object.keys(v).slice(0,4).join(',')+'}':'='+JSON.stringify(v).slice(0,30)));if(!Array.isArray(v))walk(v,q,d+1);else if(v[0])walk(v[0],q+'[0]',d+1);}};list.forEach((o,i)=>walk(o,i?'dynamic':'static',0));return [...out].slice(0,25);}

// Betyget ur Wolts sökning (när venue-svaren saknar det).
export async function searchRating(slug,name,{lat,lon,fetchImpl}={}){
 try{const res=await getJson(`${API}/v1/pages/search`,{fetchImpl,tries:1,init:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:name,target:'venues',lat,lon})}});
  const v=(res.sections||[]).flatMap(s=>s.items||[]).map(i=>i.venue).find(v=>v?.slug===slug);
  return venueRating({x:v})??(typeof v?.rating?.score==='number'?v.rating.score:null);}catch{return null;}
}
export async function ratingFor(slug,name,ctx={}){
 try{const r=venueRating(await getJson(`${API}/order-xp/web/v1/venue/slug/${slug}/static/`,{fetchImpl:ctx.fetchImpl,tries:1}));if(r!=null)return r;}catch{}
 return searchRating(slug,name,ctx);
}

// Söker en restaurang med exakt samma namn (skiftläge spelar ingen roll). Returnerar {name,url} eller null.
export async function searchWolt(name,{lat,lon,fetchImpl}={}){
 const res=await getJson(`${API}/v1/pages/search`,{fetchImpl,init:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:name,target:'venues',lat,lon})}});
 const key=s=>clean(s).toLocaleLowerCase('sv');
 const hits=(res.sections||[]).flatMap(s=>s.items||[]).map(i=>i.venue).filter(v=>v?.slug&&key(v.name)===key(name));
 const unique=[...new Map(hits.map(v=>[v.slug,v])).values()];
 return unique.length===1?{name:clean(unique[0].name),url:venueUrl(unique[0].slug)}:null;
}



// Upptäckt: alla restauranger som levererar till positionen, som Wolts startsida visar dem.
// Svaret läses tåligt: alla objekt med slug och namn som ser ut som en restaurang plockas ut, oavsett var i svaret
// de ligger. Butiker (product_line ≠ restaurant) hoppas över.
export function parseVenueList(json){
 const out=new Map();
 const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return;}
  if(typeof o.slug==='string'&&typeof o.name==='string'&&('delivers' in o||'online' in o||'product_line' in o||'rating' in o||'estimate' in o)){
   const line=String(o.product_line||'restaurant').toLowerCase();
   if(line==='restaurant'&&o.delivers!==false&&!out.has(o.slug))out.set(o.slug,{name:clean(o.name),url:venueUrl(o.slug),
    rating:typeof o.rating?.score==='number'?o.rating.score:null,tags:(Array.isArray(o.tags)?o.tags:[]).map(t=>clean(typeof t==='string'?t:t?.name)).filter(Boolean).slice(0,6),
    estimate:typeof o.estimate==='number'?o.estimate:null,...placeOf(o)});
   return;}
  for(const v of Object.values(o))walk(v);};
 walk(json);return [...out.values()];
}
export async function discoverWolt({lat,lon,fetchImpl}={}){
 const list=parseVenueList(await getJson(`${API}/v1/pages/restaurants?lat=${lat}&lon=${lon}`,{fetchImpl}));
 if(!list.length)throw Error('Wolts restauranglista var tom eller i okänt format.');
 return list;
}

export default {id:'wolt',label:'Wolt',matches,fetchSnapshot:fetchWolt,search:searchWolt,discover:discoverWolt};
