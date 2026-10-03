// Avgifter ovanpå menypriset (serviceavgift och leverans, efter Wolt+-rabatt), uppskattade från egna kvitton.
// Wolts serviceavgift räknas på rättens ordinarie pris, även när rätten har kampanjpris, så avgiften
// uttrycks som andel av ordinarie pris. data/fees.json har en rad per order: restaurang, datum,
// rätternas ordinarie pris och betalda avgifter (öre). Inga ordernummer eller totalsummor.
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
// Orimliga andelar (t.ex. ofullständiga kvitton) räknas inte.
const MAX_RATIO=0.3;
export function feeModel(store){
 const orders=(store?.orders||[]).filter(o=>o.list>0&&o.fees>=0&&o.fees/o.list<=MAX_RATIO).sort((a,b)=>a.date.localeCompare(b.date));
 if(!orders.length)return null;
 const venues=new Map();for(const o of orders){if(!venues.has(o.venue))venues.set(o.venue,[]);venues.get(o.venue).push(o.fees/o.list);}
 // Senaste ordrarna väger tyngst: avgiftsnivån ändras över tid (t.ex. Wolt+-kampanjer).
 return {all:median(orders.slice(-10).map(o=>o.fees/o.list)),venues:new Map([...venues].map(([v,r])=>[v,{ratio:median(r.slice(-3)),n:r.length}]))};
}
export function withFees(model,venue,price,originalPrice){
 if(!model)return null;const v=model.venues.get(venue),ratio=v?v.ratio:model.all,fee=Math.round(originalPrice*ratio);
 return {fee,total:price+fee,ratio,orders:v?.n||0};
}
