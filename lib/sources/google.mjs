// Google-betyg via Places API (New). Kräver GOOGLE_PLACES_KEY; utan nyckel görs inget.
// Första gången söks restaurangen upp (namn + adress nära Wolts position); därefter hämtas betyget direkt med plats-id:t.
// Betyg uppdateras högst en gång per vecka per restaurang och missar provas igen efter en vecka, så att gratiskvoten räcker.
import {getJson} from './wolt.mjs';
import {sameName,nameKey} from './ubereats.mjs';

const API='https://places.googleapis.com/v1';
const FIELDS='id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,location';
const DAY=86400000;
const km=(a,b,c,d)=>{const r=Math.PI/180,h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(h));};
const place=p=>p?.id?{id:p.id,name:p.displayName?.text||'',address:p.formattedAddress||'',lat:p.location?.latitude??null,lon:p.location?.longitude??null,rating:Number.isFinite(p.rating)?p.rating:null,count:Number.isInteger(p.userRatingCount)?p.userRatingCount:0,maps:p.googleMapsUri||''}:null;

// Ord som inte säger något om vilken restaurang det är ("MAX Stockholm - Sköndal" och "MAX Premium Burgers" delar "max").
const STOP=/\b(stockholm|sthlm|sverige|restaurang|restaurant|resturang|ristorante|pizzeria|cafe|kafe|bar|grill|kok|the|och|and|ab)\b/g;
const words=n=>nameKey(n).replace(STOP,' ').split(/\s+/).filter(w=>w.length>=3);
// Hur väl namnen stämmer: 2 samma namn, 1 namn plus fler ord (ort), 0.5 samma första kännetecknande ord, 0 olika.
export function nameScore(a,b){const m=sameName(a,b);if(m)return m;const x=words(a),y=words(b);return x[0]&&x[0]===y[0]?0.5:0;}
// Största avstånd (km) per namnträff: med Wolts position krävs att stället ligger nära; utan den räcker samma namn inom 8 km.
const MAX_KM={2:1.5,1:0.8,0.5:0.4};
// Alla kandidater med namnträff och avstånd; den första som klarar gränserna (bäst namn, sedan närmast) är träffen.
export function rankPlaces({name,pos,center},places){
 return (places||[]).map(p=>{const l=p?.location,ref=pos||center,d=ref&&Number.isFinite(l?.latitude)?km(ref.lat,ref.lon,l.latitude,l.longitude):null;
  const m=nameScore(name,p?.displayName?.text),ok=m>0&&(d===null?!pos&&!center:pos?d<=MAX_KM[m]:m>=1&&d<=8);return {p,m,d,ok};})
  .sort((a,b)=>b.ok-a.ok||b.m-a.m||(a.d??99)-(b.d??99));
}
export const pickPlace=(venue,places)=>{const c=rankPlaces(venue,places)[0];return c?.ok?c.p:null;};
// Sökningen med alla kandidater (för kontroll i provkörningen) och den valda platsen.
export async function explainPlace(venue,{key,center,fetchImpl}){
 const ref=venue.pos||center;
 const res=await getJson(`${API}/places:searchText`,{fetchImpl,tries:2,init:{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key,'x-goog-fieldmask':FIELDS.split(',').map(f=>'places.'+f).join(',')},
  body:JSON.stringify({textQuery:[venue.name,venue.address].filter(Boolean).join(', '),languageCode:'sv',regionCode:'SE',maxResultCount:5,
   ...(ref?{locationBias:{circle:{center:{latitude:ref.lat,longitude:ref.lon},radius:venue.pos?1500:10000}}}:{})})}});
 const ranked=rankPlaces({name:venue.name,pos:venue.pos,center},res?.places);
 return {pick:ranked[0]?.ok?place(ranked[0].p):null,candidates:ranked.map(c=>({...place(c.p),km:c.d,score:c.m,ok:c.ok}))};
}
export const searchPlace=async(venue,ctx)=>(await explainPlace(venue,ctx)).pick;
export async function placeDetails(id,{key,fetchImpl}){
 return place(await getJson(`${API}/places/${encodeURIComponent(id)}`,{fetchImpl,tries:2,init:{headers:{'x-goog-api-key':key,'x-goog-fieldmask':FIELDS}}}));
}
// Poster utan Googles namn (sparade före namnet lades till) hämtas om en gång, så att matchningen går att kontrollera.
// Uppdaterar store ({wolt-url: {id,name,rating,count,maps,at} | {miss:true,at}}) för venues ([{url,name,address,pos}]).
export async function updateGoogle({venues,store={},key,center,fetchImpl,now=Date.now(),limit=60,maxAgeDays=7,missDays=7}){
 const out={...store},due=venues.filter(v=>{const s=store[v.url],age=s?.at?now-Date.parse(s.at):Infinity;return (s?.rating!=null&&!s.name)||age>(s?.miss?missDays:maxAgeDays)*DAY;})
  .sort((a,b)=>(Date.parse(store[a.url]?.at||0))-(Date.parse(store[b.url]?.at||0))).slice(0,limit);
 let fetched=0,found=0;const errors=[];
 for(const v of due){
  try{const old=store[v.url];let p=old?.id?await placeDetails(old.id,{key,fetchImpl}).catch(e=>{if(/HTTP 404/.test(e.message))return null;throw e;}):null;
   if(!p)p=await searchPlace(v,{key,center,fetchImpl});fetched++;
   const at=new Date(now).toISOString();if(p&&p.rating!=null){out[v.url]={id:p.id,name:p.name,rating:p.rating,count:p.count,maps:p.maps,at};found++;}else out[v.url]={miss:true,...(p?{id:p.id}:{}),at};}
  catch(e){errors.push(`${v.name}: ${e.message}`);if(/HTTP (400|401|403)/.test(e.message))break;}}
 return {store:out,fetched,found,errors,due:due.length};
}
// Kontroll (provkörningen): missar söks om och visar kandidaterna; träffar hämtas med id och jämförs med Wolts namn och position.
export async function checkGoogle({venues,store,key,center,fetchImpl,limit=60}){
 const out=[];for(const v of venues.filter(v=>store[v.url]).slice(0,limit)){const s=store[v.url];
  try{if(s.miss&&!s.id){const {pick,candidates}=await explainPlace(v,{key,center,fetchImpl});out.push({venue:v,pick,candidates,was:'miss'});}
   else if(s.id){const p=await placeDetails(s.id,{key,fetchImpl});const raw=p&&v.pos&&p.lat!=null?km(v.pos.lat,v.pos.lon,p.lat,p.lon):null;out.push({venue:v,pick:p,km:raw,score:p?nameScore(v.name,p.name):0,was:s.miss?'utan betyg':'träff'});}}
  catch(e){out.push({venue:v,error:e.message});if(/HTTP (400|401|403)/.test(e.message))break;}}
 return out;
}
