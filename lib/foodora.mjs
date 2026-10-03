// Foodora-priser för samma restauranger som bevakas på Wolt.
// data/foodora.json: en post per Wolt-restaurang (nyckel = Wolt-länken) med Foodora-länken och en ändringslogg per rätt.
// Loggpost: [tid, pris, ordinarie pris, pro-pris eller null, 1 om priset visas som "från"]. En ny post skrivs bara när något av det ändras.
// Foodora har inga rätt-ID:n i menyn; rätten identifieras med sitt namn (gemener), samma som i scripts/extract-foodora.js.
const FOODORA_URL=/^\/restaurant\/[a-z0-9]+\/[a-z0-9-]+$/,WOLT_URL=/^\/sv\/swe\/stockholm\/restaurant\/[a-z0-9-]+$/;
export const emptyFoodora=()=>({version:1,venues:{}});
const int=n=>Number.isInteger(n)&&n>=0;
function cleanUrl(u,origin,path,msg){let x;try{x=new URL(String(u));}catch{throw Error(msg);}if(x.origin!==origin||!path.test(x.pathname))throw Error(msg);return x.origin+x.pathname;}
export function validateFoodora(batch){
 if(!batch||!Array.isArray(batch.foodora)||!batch.foodora.length||batch.foodora.length>100)throw Error('Foodora-avläsningar saknas eller är för många.');
 return batch.foodora.map(s=>{
  const url=cleanUrl(s.url,'https://www.foodora.se',FOODORA_URL,'Ogiltig Foodora-länk.'),wolt=cleanUrl(s.wolt,'https://wolt.com',WOLT_URL,'Ogiltig Wolt-länk för Foodora-restaurangen.');
  if(!s.name||!Number.isFinite(Date.parse(s.observedAt))||Date.parse(s.observedAt)>Date.now()+300000||!Array.isArray(s.items)||!s.items.length)throw Error('Ofullständig Foodora-avläsning.');
  const ids=new Set();const items=s.items.map(i=>{
   if(!i.id||ids.has(i.id)||!i.name||!int(i.price)||!int(i.originalPrice)||i.originalPrice<i.price||!(i.proPrice===null||i.proPrice===undefined||(int(i.proPrice)&&i.proPrice<=i.price)))throw Error('Ogiltig eller duplicerad Foodora-rätt.');
   ids.add(i.id);return {id:String(i.id),name:String(i.name),category:String(i.category||''),price:i.price,originalPrice:i.originalPrice,proPrice:i.proPrice??null,from:!!i.from};});
  return {url,wolt,name:String(s.name),observedAt:new Date(s.observedAt).toISOString(),items};
 });
}
// Avläsningar äldre än restaurangens senaste hoppas över; loggen byggs bara framåt.
export function mergeFoodora(store,batch){
 const venues={...(store?.venues||{})};
 for(const s of validateFoodora(batch).sort((a,b)=>a.observedAt.localeCompare(b.observedAt))){
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
// Aktuell Foodora-meny för en Wolt-restaurang (rätter som fanns i senaste avläsningen).
export function foodoraMenu(store,woltUrl){
 const v=store?.venues?.[woltUrl];if(!v)return null;
 const items=Object.entries(v.items).filter(([,i])=>i.seen===v.observedAt).map(([id,i])=>{const [,price,originalPrice,proPrice,from]=i.log.at(-1);return {id,name:i.name,key:norm(i.name),category:i.category,price,originalPrice,proPrice,from:!!from,log:i.log};});
 return {url:v.url,name:v.name,observedAt:v.observedAt,items};
}
// Samma rätt på Foodora: exakt samma namn (utan skiljetecken och versaler). Flera träffar avgörs av kategorin;
// annars bara om alla har samma pris. Inga gissningar på liknande namn.
export function matchFoodora(menu,item){
 if(!menu)return null;const k=norm(item.name),hits=menu.items.filter(i=>i.key===k);
 if(hits.length<=1)return hits[0]||null;
 const sameCat=hits.filter(i=>norm(i.category)===norm(item.category||''));if(sameCat.length===1)return sameCat[0];
 return hits.every(i=>i.price===hits[0].price&&i.proPrice===hits[0].proPrice)?hits[0]:null;
}
export const foodoraPrice=(f,pro)=>f?(pro&&f.proPrice!==null?f.proPrice:f.price):null;
export const foodoraPoints=(f,pro)=>(f?.log||[]).map(([date,price,,proPrice,from])=>({date,price:pro&&proPrice!==null?proPrice:price,from:!!from,source:'foodora'}));
