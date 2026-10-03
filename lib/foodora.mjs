// Priser från andra appar (Foodora, Uber Eats) för samma restauranger som bevakas på Wolt.
// data/foodora.json och data/ubereats.json: en post per Wolt-restaurang (nyckel = Wolt-länken) med appens länk och en ändringslogg per rätt.
// Loggpost: [tid, pris, ordinarie pris, pro-pris eller null, 1 om priset visas som "från"]. En ny post skrivs bara när något av det ändras.
// Foodora har inga rätt-ID:n i menyn; rätten identifieras med sitt namn (gemener), samma som i scripts/extract-foodora.js.
// Uber Eats har rätt-ID:n (uuid), men de skiljer sig från Wolts; jämförelsen sker ändå på namn.
const WOLT_URL=/^\/sv\/swe\/stockholm\/restaurant\/[a-z0-9-]+$/;
export const FOODORA={key:'foodora',label:'Foodora',origin:'https://www.foodora.se',path:/^\/restaurant\/[a-z0-9]+\/[a-z0-9-]+$/};
export const UBEREATS={key:'ubereats',label:'Uber Eats',origin:'https://www.ubereats.com',path:/^\/se\/store\/[^/]+\/[A-Za-z0-9_-]{22}$/};
export const emptyFoodora=()=>({version:1,venues:{}});
const int=n=>Number.isInteger(n)&&n>=0;
function cleanUrl(u,origin,path,msg){let x;try{x=new URL(String(u));}catch{throw Error(msg);}if(x.origin!==origin||!path.test(x.pathname))throw Error(msg);return x.origin+x.pathname;}
export function validateFoodora(batch,p=FOODORA){
 const list=batch?.[p.key];
 if(!Array.isArray(list)||!list.length||list.length>100)throw Error(`${p.label}-avläsningar saknas eller är för många.`);
 return list.map(s=>{
  const url=cleanUrl(s.url,p.origin,p.path,`Ogiltig ${p.label}-länk.`),wolt=cleanUrl(s.wolt,'https://wolt.com',WOLT_URL,`Ogiltig Wolt-länk för ${p.label}-restaurangen.`);
  if(!s.name||!Number.isFinite(Date.parse(s.observedAt))||Date.parse(s.observedAt)>Date.now()+300000||!Array.isArray(s.items)||!s.items.length)throw Error(`Ofullständig ${p.label}-avläsning.`);
  const ids=new Set();const items=s.items.map(i=>{
   if(!i.id||ids.has(i.id)||!i.name||!int(i.price)||!int(i.originalPrice)||i.originalPrice<i.price||!(i.proPrice===null||i.proPrice===undefined||(int(i.proPrice)&&i.proPrice<=i.price)))throw Error(`Ogiltig eller duplicerad ${p.label}-rätt.`);
   ids.add(i.id);return {id:String(i.id),name:String(i.name),category:String(i.category||''),price:i.price,originalPrice:i.originalPrice,proPrice:i.proPrice??null,from:!!i.from};});
  return {url,wolt,name:String(s.name),observedAt:new Date(s.observedAt).toISOString(),items};
 });
}
// Avläsningar äldre än restaurangens senaste hoppas över; loggen byggs bara framåt.
export function mergeFoodora(store,batch,p=FOODORA){
 const venues={...(store?.venues||{})};
 for(const s of validateFoodora(batch,p).sort((a,b)=>a.observedAt.localeCompare(b.observedAt))){
  const prev=venues[s.wolt];if(prev&&prev.observedAt>=s.observedAt)continue;
  const items={...(prev?.items||{})};
  for(const i of s.items){const e=[s.observedAt,i.price,i.originalPrice,i.proPrice,i.from?1:0],old=items[i.id],last=old?.log.at(-1);
   const log=old&&old.seen===prev?.observedAt&&JSON.stringify(last.slice(1))===JSON.stringify(e.slice(1))?old.log:[...(old?.log||[]),e];
   items[i.id]={name:i.name,category:i.category,seen:s.observedAt,log};}
  venues[s.wolt]={url:s.url,name:s.name,observedAt:s.observedAt,items};
 }
 return {version:1,venues};
}
const norm=s=>String(s).toLocaleLowerCase('sv').replace(/[´`'’"]/g,'').replace(/[^a-zåäöéü0-9]+/g,' ').trim();
// Andra försöket: utan text inom parentes och ordet pizza ("Chicken Madras (Stark)" = "Chicken Madras", "Capricciosa Pizza" = "Capricciosa").
const loose=s=>norm(String(s).replace(/\([^)]*\)/g,' ').replace(/\bpizza\b/gi,' '));
// Aktuell Foodora-meny för en Wolt-restaurang (rätter som fanns i senaste avläsningen).
export function foodoraMenu(store,woltUrl){
 const v=store?.venues?.[woltUrl];if(!v)return null;
 const items=Object.entries(v.items).filter(([,i])=>i.seen===v.observedAt).map(([id,i])=>{const [,price,originalPrice,proPrice,from]=i.log.at(-1);return {id,name:i.name,key:norm(i.name),loose:loose(i.name),category:i.category,price,originalPrice,proPrice,from:!!from,log:i.log};});
 return {url:v.url,name:v.name,observedAt:v.observedAt,items};
}
// Samma rätt i den andra appen: samma namn (utan skiljetecken och versaler). Flera träffar avgörs av kategorin;
// annars bara om alla har samma pris. Utan exakt träff: samma namn utan parentes/ordet pizza, entydigt och med
// rimligt pris; sådana träffar märks similar och sidan visar den andra appens namn.
export function matchFoodora(menu,item){
 if(!menu)return null;const k=norm(item.name),hits=menu.items.filter(i=>i.key===k);
 if(!hits.length){
  // Bara en entydig träff på det förenklade namnet, och bara om priset är rimligt likt (halva till dubbla).
  const l=loose(item.name),near=l?menu.items.filter(i=>(i.loose??loose(i.name))===l):[];
  const f=near.length===1?near[0]:null,p=item.price;
  return f&&(!Number.isInteger(p)||(f.price>=p/2&&f.price<=p*2))?{...f,similar:true}:null;
 }
 if(hits.length===1)return hits[0];
 const sameCat=hits.filter(i=>norm(i.category)===norm(item.category||''));if(sameCat.length===1)return sameCat[0];
 return hits.every(i=>i.price===hits[0].price&&i.proPrice===hits[0].proPrice)?hits[0]:null;
}
export const foodoraPrice=(f,pro)=>f?(pro&&f.proPrice!==null?f.proPrice:f.price):null;
export const foodoraPoints=(f,pro,source='foodora')=>(f?.log||[]).map(([date,price,,proPrice,from])=>({date,price:pro&&proPrice!==null?proPrice:price,from:!!from,source}));
