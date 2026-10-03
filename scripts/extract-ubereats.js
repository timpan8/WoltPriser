// Skrivskyddad läsning av Uber Eats-menyer i din inloggade webbläsare (reserv om GitHub blockeras).
// Kör på en flik med https://www.ubereats.com öppen och leveransadressen satt. Argument: listan från
// `node scripts/ubereats-targets.mjs`. Gör samma anrop som sajten själv gör (sök och meny) och returnerar bara
// menyfälten som behövs; läser aldrig kakor, konto, adress, varukorg eller ordrar. Valet av butik görs vid importen.
async (targets) => {
 const post=async(name,body)=>{const r=await fetch('/_p/api/'+name+'?localeCode=se',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'x'},body:JSON.stringify(body)});
  if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j?.status!=='success')throw Error('Uber Eats svarade utan data');return j.data;};
 const uuidOf=url=>{const b=new URL(url).pathname.split('/').filter(Boolean).at(-1).replace(/-/g,'+').replace(/_/g,'/');
  const h=[...atob(b+'='.repeat((4-b.length%4)%4))].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
 const found=json=>{const out=new Map(),walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(walk);
  if(typeof o.storeUuid==='string'&&o.title){out.set(o.storeUuid,1);return;}Object.values(o).forEach(walk);};walk(json);return [...out.keys()];};
 const trim=d=>({uuid:d.uuid,slug:d.slug,title:d.title,location:d.location&&{latitude:d.location.latitude,longitude:d.location.longitude},
  catalogSectionsMap:Object.fromEntries(Object.entries(d.catalogSectionsMap||{}).map(([k,secs])=>[k,(secs||[]).map(s=>{const p=s?.payload?.standardItemsPayload;
   return {type:s?.type,payload:{standardItemsPayload:p&&{title:{text:p.title?.text},catalogItems:(p.catalogItems||[]).map(i=>({uuid:i.uuid,title:i.title,price:i.price,
    priceTagline:i.priceTagline&&{textFormat:i.priceTagline.textFormat,accessibilityText:i.priceTagline.accessibilityText},isSoldOut:i.isSoldOut,isAvailable:i.isAvailable}))}}};})]))});
 const wait=()=>new Promise(r=>setTimeout(r,400+Math.random()*400)),out=[];
 for(const t of targets){
  try{
   const uuids=t.ubereats?[uuidOf(t.ubereats)]:found(await post('getSearchFeedV1',{userQuery:t.name,date:'',startTime:0,endTime:0,sortAndFilters:[],vertical:'ALL',searchSource:'SEARCH_BAR',displayType:'SEARCH_RESULTS',searchType:'GLOBAL_SEARCH',keyName:'',cacheKey:'',recaptchaToken:''})).slice(0,3);
   const stores=[];for(const u of uuids){await wait();const d=await post('getStoreV1',{storeUuid:u});stores.push(trim({...d,uuid:d.uuid||u}));}
   out.push({wolt:t.wolt,name:t.name,ubereats:t.ubereats||null,observedAt:new Date().toISOString(),stores});
  }catch(e){out.push({wolt:t.wolt,name:t.name,error:String(e?.message||e)});}
  await wait();
 }
 return out;
}
