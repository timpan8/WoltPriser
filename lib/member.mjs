// Dina priser ovanpå grunddatan.
// history.json = allas priser (skrapan, ej inloggad). member.json = dina priser från din inloggade webbläsare
// (samma format). Den publicerade historiken är grunddatan där varje rätt får ditt pris om:
//  - din senaste läsning av restaurangen är högst MAX_AGE_DAYS gammal vid grundavläsningen,
//  - rätten har samma ordinarie pris i båda (annars har restaurangen ändrat priset sedan dess), och
//  - ditt pris är lägre (t.ex. Wolt+-kampanj som inte syns utan inloggning).
// Dina egna läsningar ingår också som avläsningar i historiken.
import {normalizeHistory,emptyHistory,expandVenue,latestSnapshots} from './prices.mjs';
export const MAX_AGE_DAYS=7;
const DAY=86400000;

function overlay(items,mine){
 if(!mine)return items;const by=new Map(mine.items.map(i=>[i.id,i]));
 return items.map(i=>{const m=by.get(i.id);return m&&m.originalPrice===i.originalPrice&&m.price<i.price?{...i,price:m.price,woltPlus:m.woltPlus,offer:m.offer||i.offer}:i;});
}
// Senaste egna läsning som är gjord före tidpunkten t och inte är för gammal.
const memberAt=(list,t,maxAge)=>{let hit=null;for(const m of list){const mt=Date.parse(m.observedAt);if(mt<=t&&t-mt<=maxAge)hit=m;}return hit;};

export function effectiveHistory(base,member,maxAgeDays=MAX_AGE_DAYS){
 base=normalizeHistory(base||emptyHistory());member=normalizeHistory(member||emptyHistory());
 if(!member.readings.length)return base;
 const maxAge=maxAgeDays*DAY,snaps=[];
 const group=h=>{const m=new Map();for(const r of h.readings){if(!m.has(r.url))m.set(r.url,[]);m.get(r.url).push(r);}return m;},br=group(base),mr=group(member);
 for(const url of new Set([...br.keys(),...mr.keys()])){
  const mine=expandVenue(member,url,mr.get(url)||[]);
  for(const s of expandVenue(base,url,br.get(url)||[]))snaps.push({...s,items:overlay(s.items,memberAt(mine,Date.parse(s.observedAt),maxAge))});
  snaps.push(...mine);
 }
 return normalizeHistory(snaps);
}
// Rätter (restaurang|id) där du har ett färskt eget pris vid tidpunkten now; används av skrapans Wolt+-varning.
export function freshMemberPrices(member,now,maxAgeDays=MAX_AGE_DAYS){
 const out=new Set();if(!member?.readings?.length)return out;
 for(const s of latestSnapshots(normalizeHistory(member)))if(Date.parse(now)-Date.parse(s.observedAt)<=maxAgeDays*DAY)for(const i of s.items)if(i.price<i.originalPrice)out.add(s.url+'|'+i.id);
 return out;
}
