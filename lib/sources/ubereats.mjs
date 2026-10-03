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
 const res=await getJson(API,{fetchImpl,init:{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'x'},body:JSON.stringify({storeUuid:storeUuid(venue.ubereats)})}});
 if(res?.status!=='success'||!res.data)throw Error('Uber Eats svarade utan meny.');
 return mapUberEats({store:res.data,url:new URL(venue.ubereats).origin+new URL(venue.ubereats).pathname,wolt:venue.url,name:clean(res.data.title)||venue.name,now});
}
