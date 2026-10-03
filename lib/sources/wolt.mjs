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

export async function fetchWolt(venue,{lat,lon,fetchImpl,now}={}){
 const slug=slugFromUrl(venue.url);
 const assortment=await getJson(`${API}/consumer-api/consumer-assortment/v1/venues/slug/${slug}/assortment`,{fetchImpl});
 if(assortment.loading_strategy&&assortment.loading_strategy!=='full')throw Error(`Menyn levereras i delar (${assortment.loading_strategy}); stöds inte än.`);
 // Kampanjer krävs: utan dem kan ett rabatterat pris sparas som ordinarie. Hellre misslyckad restaurang än fel pris.
 let dynamic;
 try{dynamic=await getJson(`${API}/order-xp/web/v1/venue/slug/${slug}/dynamic/?lat=${lat}&lon=${lon}&selected_delivery_method=homedelivery`,{fetchImpl});}
 catch(e){throw Error('kampanjer kunde inte läsas ('+e.message+')');}
 return {snapshot:mapWolt({assortment,dynamic,url:venueUrl(slug),name:venue.name,now}),warning:''};
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
    estimate:typeof o.estimate==='number'?o.estimate:null});
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
