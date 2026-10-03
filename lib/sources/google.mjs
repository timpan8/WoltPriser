// Google-betyg via Places API (New). Kräver GOOGLE_PLACES_KEY; utan nyckel görs inget.
// Första gången söks restaurangen upp (namn + adress nära Wolts position); därefter hämtas betyget direkt med plats-id:t.
// Betyg uppdateras högst en gång per vecka per restaurang och missar provas igen efter en månad, så att gratiskvoten räcker.
import {getJson} from './wolt.mjs';
import {sameName} from './ubereats.mjs';

const API='https://places.googleapis.com/v1';
const FIELDS='id,displayName,rating,userRatingCount,googleMapsUri,location';
const DAY=86400000;
const km=(a,b,c,d)=>{const r=Math.PI/180,h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(h));};
const place=p=>p?.id?{id:p.id,name:p.displayName?.text||'',rating:Number.isFinite(p.rating)?p.rating:null,count:Number.isInteger(p.userRatingCount)?p.userRatingCount:0,maps:p.googleMapsUri||''}:null;

// Väljer platsen som är samma restaurang: samma namn (eller namn plus ort) och nära Wolts position.
export function pickPlace({name,pos,center},places){
 return (places||[]).map(p=>{const l=p?.location,ref=pos||center,d=ref&&Number.isFinite(l?.latitude)?km(ref.lat,ref.lon,l.latitude,l.longitude):null;return {p,m:sameName(name,p?.displayName?.text),d};})
  .filter(c=>c.m&&(c.d===null?!pos&&!center:c.d<=(pos?(c.m===2?1:0.5):8))).sort((a,b)=>b.m-a.m||(a.d??99)-(b.d??99))[0]?.p||null;
}
export async function searchPlace(venue,{key,center,fetchImpl}){
 const ref=venue.pos||center;
 const res=await getJson(`${API}/places:searchText`,{fetchImpl,tries:2,init:{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key,'x-goog-fieldmask':FIELDS.split(',').map(f=>'places.'+f).join(',')},
  body:JSON.stringify({textQuery:[venue.name,venue.address].filter(Boolean).join(', '),languageCode:'sv',regionCode:'SE',maxResultCount:5,
   ...(ref?{locationBias:{circle:{center:{latitude:ref.lat,longitude:ref.lon},radius:venue.pos?1500:10000}}}:{})})}});
 return place(pickPlace({name:venue.name,pos:venue.pos,center},res?.places));
}
export async function placeDetails(id,{key,fetchImpl}){
 return place(await getJson(`${API}/places/${encodeURIComponent(id)}`,{fetchImpl,tries:2,init:{headers:{'x-goog-api-key':key,'x-goog-fieldmask':FIELDS}}}));
}
// Uppdaterar store ({wolt-url: {id,rating,count,maps,at} | {miss:true,at}}) för venues ([{url,name,address,pos}]).
export async function updateGoogle({venues,store={},key,center,fetchImpl,now=Date.now(),limit=60,maxAgeDays=7,missDays=30}){
 const out={...store},due=venues.filter(v=>{const s=store[v.url],age=s?.at?now-Date.parse(s.at):Infinity;return age>(s?.miss?missDays:maxAgeDays)*DAY;})
  .sort((a,b)=>(Date.parse(store[a.url]?.at||0))-(Date.parse(store[b.url]?.at||0))).slice(0,limit);
 let fetched=0,found=0;const errors=[];
 for(const v of due){
  try{const old=store[v.url];let p=old?.id?await placeDetails(old.id,{key,fetchImpl}).catch(e=>{if(/HTTP 404/.test(e.message))return null;throw e;}):null;
   if(!p)p=await searchPlace(v,{key,center,fetchImpl});fetched++;
   const at=new Date(now).toISOString();if(p&&p.rating!=null){out[v.url]={id:p.id,rating:p.rating,count:p.count,maps:p.maps,at};found++;}else out[v.url]={miss:true,...(p?{id:p.id}:{}),at};}
  catch(e){errors.push(`${v.name}: ${e.message}`);if(/HTTP (400|401|403)/.test(e.message))break;}}
 return {store:out,fetched,found,errors,due:due.length};
}
