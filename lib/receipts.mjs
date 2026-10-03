// Kvittopriser: vad en rätt faktiskt kostade vid ett eget köp, efter rabatt men utan avgifter och tillval.
// Wolt visar rabatten som en klumpsumma per order. Den fördelas så här:
// 1. Rabatten är en jämn procentsats (5 %, 10 % … 90 %) av exakt en rätt → bara den rätten får rabatten.
// 2. Rabatten är en jämn procentsats av hela ordern → alla rätter får samma procentsats.
// 3. Samma två kontroller med leveransavgiften borträknad (gratis leverans ingår ibland i rabatten).
// 4. Annars fördelas rabatten proportionellt och priset markeras som uppskattat.
const RATES=Array.from({length:18},(_,k)=>(k+1)*5/100);
const isRate=(discount,base)=>base>0&&RATES.find(p=>Math.abs(base*p-discount)<=1);
export const emptyReceipts=()=>({version:1,prices:[]});
export function receiptPrices(r){
 if(!r.delivered||!r.items.length)return [];
 const base=r.items.map(i=>(i.price+i.options)*i.count),total=base.reduce((a,b)=>a+b,0);
 let rates=r.discount>0?null:r.items.map(()=>0),estimated=false;
 for(const d of rates?[]:[r.discount,r.discount-r.delivery].filter((d,k)=>d>0&&(k===0||r.delivery>0))){
  const single=base.map(b=>isRate(d,b)),hits=single.filter(Boolean).length;
  if(hits===1){rates=single.map(p=>p||0);break;}
  const whole=isRate(d,total);if(whole){rates=r.items.map(()=>whole);break;}
 }
 if(!rates){const p=total?Math.min(r.discount,total)/total:0;rates=r.items.map(()=>p);estimated=p>0;}
 return r.items.map((i,k)=>({venue:r.venue,date:r.date,id:i.id,name:i.name,price:Math.round(i.price*(1-rates[k])),listPrice:i.price,estimated}));
}
export function validateReceipts(batch){
 if(!batch||!Array.isArray(batch.receipts)||!batch.receipts.length||batch.receipts.length>500)throw Error('Kvitton saknas eller är för många.');
 const int=n=>Number.isInteger(n)&&n>=0;
 return batch.receipts.map(r=>{
  if(!r.venue||!/^\d{4}-\d\d-\d\d$/.test(r.date||'')||Date.parse(r.date)>Date.now()+86400000||typeof r.delivered!=='boolean'||!int(r.delivery)||!int(r.discount)||!Array.isArray(r.items))throw Error('Ofullständigt kvitto.');
  const items=r.items.map(i=>{if(!/^[a-f0-9]{24}$/.test(i.id||'')||!i.name||!int(i.price)||!int(i.options)||!Number.isInteger(i.count)||i.count<1)throw Error('Ogiltig rad på kvitto.');return {id:i.id,name:String(i.name),price:i.price,count:i.count,options:i.options};});
  return {venue:String(r.venue),date:r.date,delivered:r.delivered,delivery:r.delivery,discount:r.discount,items};
 });
}
export function mergeReceipts(store,batch){
 const map=new Map((store?.prices||[]).map(p=>[p.venue+'|'+p.date+'|'+p.id,p]));
 for(const r of validateReceipts(batch))for(const p of receiptPrices(r))map.set(p.venue+'|'+p.date+'|'+p.id,p);
 return {version:1,prices:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.venue.localeCompare(b.venue)||a.id.localeCompare(b.id))};
}
// Kvittopunkter för en rätt på menyn: samma restaurang (namn) och samma Wolt-rätt-ID.
export function receiptPoints(store,venue,id){return (store?.prices||[]).filter(p=>p.venue===venue&&p.id===id).map(p=>({date:p.date+'T12:00:00.000Z',price:p.price,estimated:p.estimated,source:'kvitto'}));}
