// Uber Eats-källa: läser en restaurangs meny från Uber Eats öppna webb-API (getStoreV1, samma anrop som
// ubereats.com gör utan inloggning). Resultatet sparas som jämförelsepriser i data/ubereats.json (samma format
// som Foodora, se lib/foodora.mjs). Uber One-priser syns bara för inloggade och kommer inte med.
import {getJson} from './wolt.mjs';

const API='https://www.ubereats.com/_p/api/getStoreV1?localeCode=se';
const FEATURED=/utvalda|populär|popular|featured|spara på|erbjudand|deals|rekommender/i;
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();

// Butikslänken slutar med butikens uuid i base64url (22 tecken).
export function storeUuid(url){
 const b64=new URL(url).pathname.split('/').filter(Boolean).at(-1);
 const hex=Buffer.from(b64,'base64url').toString('hex');
 if(hex.length!==32)throw Error('Ogiltig Uber Eats-länk.');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const storeUrl=(slug,uuid)=>`https://www.ubereats.com/se/store/${encodeURIComponent(slug)}/${Buffer.from(uuid.replace(/-/g,''),'hex').toString('base64url')}`;

const kr=s=>{const m=String(s||'').match(/(\d[\d\s .]*(?:,\d{1,2})?)\s*kr/);return m?Math.round(Number(m[1].replace(/[\s .]/g,'').replace(',','.'))*100):null;};
// Överstruket ordinarie pris finns bara i prisradens formatering.
export function struckPrice(tagline){
 const m=String(tagline?.textFormat||'').match(/line-through[^>]*>([^<]*kr)/);
 return kr(m?.[1])??kr(String(tagline?.accessibilityText||'').match(/(?:discounted from|rabatterat från|tidigare)\s*([^,]*,\d{2}\s*kr)/i)?.[1]);
}

export function mapUberEats({store,url,wolt,name,now=new Date().toISOString()}){
 const sections=Object.values(store?.catalogSectionsMap||{}).flat();
 if(!sections.length)throw Error('Uber Eats-svaret saknar meny.');
 const items=new Map();
 for(const sec of sections){const p=sec?.payload?.standardItemsPayload;if(!p)continue;
  const title=clean(p.title?.text),featured=sec.type==='HORIZONTAL_GRID'||FEATURED.test(title);
  for(const i of p.catalogItems||[]){
   if(!i?.uuid||!Number.isInteger(i.price)||i.price<0||i.isSoldOut||i.isAvailable===false)continue;
   const prev=items.get(i.uuid);
   if(prev&&(featured||!prev.featured))continue; // samma regel som Wolt: riktig menykategori går före Utvalda/Populärt
   const orig=struckPrice(i.priceTagline);
   items.set(i.uuid,{featured,row:{id:i.uuid,name:clean(i.title),category:title,price:i.price,originalPrice:orig&&orig>i.price?orig:i.price,proPrice:null,from:false}});
  }
 }
 return {url,wolt,name:clean(name),observedAt:new Date(now).toISOString(),items:[...items.values()].map(x=>x.row)};
}

export async function fetchUberEats(venue,{fetchImpl,now}={}){
 const store=await fetchStore(storeUuid(venue.ubereats),{fetchImpl});
 return snapshotFrom(store,venue,venue.ubereats,now);
}
export function snapshotFrom(store,venue,link,now){const u=new URL(link);return mapUberEats({store,url:u.origin+u.pathname,wolt:venue.url,name:clean(store.title)||venue.name,now});}

// Sökning: Uber Eats läser leveransadressen från kakan uev2.loc (samma som när man väljer adress på sajten).
// Bara koordinaterna används; adresstexten är generisk.
const SEARCH='https://www.ubereats.com/_p/api/getSearchFeedV1?localeCode=se';
export const SEARCH_BODY=q=>({userQuery:q,date:'',startTime:0,endTime:0,sortAndFilters:[],vertical:'ALL',searchSource:'SEARCH_BAR',displayType:'SEARCH_RESULTS',searchType:'GLOBAL_SEARCH',keyName:'',cacheKey:'',recaptchaToken:''});
export const locCookie=(lat,lon)=>'uev2.loc='+encodeURIComponent(JSON.stringify({address:{address1:'Stockholm',address2:'Sverige',aptOrSuite:'',eaterFormattedAddress:'Stockholm, Sverige',subtitle:'Sverige',title:'Stockholm',uuid:''},latitude:lat,longitude:lon,reference:'',referenceType:'',type:'',addressComponents:{countryCode:'SE',firstLevelSubdivisionCode:'',city:'Stockholm',postalCode:''}}));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=t=>clean(typeof t==='string'?t:t?.text);

// Butiker i ett sökresultat (tolerant mot formatet): objekt med storeUuid och titel, i sökordning.
export function parseStoreList(json){
 const out=new Map();
 const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return;}
  if(typeof o.storeUuid==='string'&&UUID.test(o.storeUuid)&&text(o.title)){if(!out.has(o.storeUuid))out.set(o.storeUuid,{uuid:o.storeUuid,name:text(o.title)});return;}
  for(const v of Object.values(o))walk(v);};
 walk(json);return [...out.values()];
}

// Namnjämförelse mellan Wolt och Uber Eats: utan parenteser, ortsuffix efter " - ", accenter och ord som "restaurang".
export const nameKey=s=>String(s??'').toLocaleLowerCase('sv').replace(/\([^)]*\)/g,' ').split(/\s+[-–|]\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/&/g,' ').replace(/\b(restaurang|restaurant|the|och|and)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
// 2 = samma namn, 1 = ena namnet (minst två ord) är det andra plus fler ord (t.ex. ort), 0 = olika.
export function sameName(a,b){const x=nameKey(a),y=nameKey(b);if(!x||!y)return 0;if(x===y)return 2;
 const [s,l]=x.length<y.length?[x,y]:[y,x];return s.includes(' ')&&s.length>=5&&l.startsWith(s+' ')?1:0;}
const km=(a,b,c,d)=>{const r=Math.PI/180,h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(h));};
// Väljer rätt butik bland kandidaterna: samma namn inom 8 km, eller namn plus ort inom 3 km. Närmast vinner.
export function pickStore({name,stores,lat,lon}){
 return stores.map(s=>{const loc=s?.location,d=Number.isFinite(loc?.latitude)&&Number.isFinite(lat)?km(lat,lon,loc.latitude,loc.longitude):null;return {s,m:sameName(name,s?.title),d};})
  .filter(c=>c.m===2?(c.d===null||c.d<=8):c.m===1&&c.d!==null&&c.d<=3).sort((a,b)=>b.m-a.m||(a.d??99)-(b.d??99))[0]?.s||null;
}
export const linkFor=store=>storeUrl(store.slug||nameKey(store.title).replace(/ /g,'-')||'store',store.uuid);

export async function fetchStore(uuid,{fetchImpl}={}){
 const res=await getJson(API,{fetchImpl,init:{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'x'},body:JSON.stringify({storeUuid:uuid})}});
 if(res?.status!=='success'||!res.data)throw Error('Uber Eats svarade utan meny.');
 return {...res.data,uuid:res.data.uuid||uuid};
}
// Söker restaurangen på Uber Eats (namnet från Wolt) och läser de högst tre kandidater vars namn stämmer.
// Ger {store, url} eller null om ingen entydig träff levererar nära positionen.
export async function findUberEats(venue,{lat,lon,fetchImpl,pause=async()=>{}}={}){
 const res=await getJson(SEARCH,{fetchImpl,init:{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'x',cookie:locCookie(lat,lon)},body:JSON.stringify(SEARCH_BODY(venue.name))}});
 if(res?.status!=='success')throw Error('Uber Eats-sökningen svarade utan resultat.');
 const stores=[];
 for(const c of parseStoreList(res.data).filter(c=>sameName(venue.name,c.name)).slice(0,3)){await pause();stores.push(await fetchStore(c.uuid,{fetchImpl}));}
 const store=pickStore({name:venue.name,stores,lat,lon});
 return store?{store,url:linkFor(store)}:null;
}
