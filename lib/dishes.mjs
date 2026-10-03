// Hittar samma typ av rätt hos olika restauranger utifrån rättens namn.
// Orden viktas efter hur ovanliga de är på menyerna (IDF), så "tikka" och "masala" väger tyngre än "chicken".
// Rätter med olika protein (kyckling, lamm, paneer …) räknas aldrig som samma rätt.
const SYN={kyckling:'chicken',kycklingfilé:'chicken',kycklingfile:'chicken',lamb:'lamm',lammfilé:'lamm',nöt:'beef',nötkött:'beef',oxfilé:'beef',biff:'beef',pork:'fläsk',fläskfilé:'fläsk',räka:'shrimp',räkor:'shrimp',scampi:'shrimp',salmon:'lax',fish:'fisk',ost:'cheese',vitlök:'garlic',smör:'butter',chili:'chili'};
const STOP=new Set(['med','och','the','with','and','inkl','dryck','drink','mål','meal','menu','meny','st','stor','liten','av','i','på','från','no','nr','kr','extra','pizza','classic','klassisk','en','ett','a','of','+']);
const PROTEIN=new Set(['chicken','lamm','beef','fläsk','paneer','halloumi','shrimp','lax','fisk','tonfisk','tofu','falafel','kebab','oumph','tuna']);
export const THRESHOLD=0.65;
export const tokens=name=>[...new Set(name.toLocaleLowerCase('sv').replace(/[^a-zåäöéü0-9 ]+/g,' ').split(/\s+/).filter(t=>t&&!/^\d+$/.test(t)&&!STOP.has(t)).map(t=>SYN[t]||t))];
export function dishIndex(names){const df=new Map();for(const n of names)for(const t of tokens(n))df.set(t,(df.get(t)||0)+1);const total=names.length||1;return t=>Math.log((total+1)/((df.get(t)||0)+1))+0.1;}
const protein=ts=>ts.filter(t=>PROTEIN.has(t)).sort().join(',');
// Hur väl rätten b motsvarar a, 0–1. Vikten av gemensamma ord delat med den större av rätternas vikter.
export function similarity(idf,a,b,variants=true){
 if(!a.length||!b.length||protein(a)!==protein(b))return 0;
 const sb=new Set(b),w=ts=>ts.reduce((s,t)=>s+idf(t),0),shared=w(a.filter(t=>sb.has(t)));
 const score=shared/Math.max(w(a),0.85*w(b));
 // b är en kortare variant av a (t.ex. annan storlek): alla ord i b finns i a och täcker minst halva vikten.
 return variants&&b.every(t=>a.includes(t))&&shared/w(a)>=0.5?Math.max(score,THRESHOLD):score;
}
// Grupperar egna köp till rätter: köp med liknande namn (även från olika restauranger) blir en grupp.
export function dishGroups(prices,idf){
 const byName=new Map();for(const p of prices){const k=p.name.toLocaleLowerCase('sv');const e=byName.get(k)||{name:p.name,tokens:tokens(p.name),buys:[]};e.buys.push(p);byName.set(k,e);}
 const groups=[];
 for(const e of [...byName.values()].sort((a,b)=>new Set(b.buys.map(p=>p.date)).size-new Set(a.buys.map(p=>p.date)).size)){
  const g=groups.find(g=>g.names.some(n=>Math.max(similarity(idf,n.tokens,e.tokens),similarity(idf,e.tokens,n.tokens))>=THRESHOLD));
  if(g){g.names.push(e);g.buys.push(...e.buys);}else groups.push({title:e.name,names:[e],buys:[...e.buys]});
 }
 return groups.map(g=>{const prices=g.buys.map(p=>p.price).sort((a,b)=>a-b),mid=prices.length>>1;
  return {title:g.title,names:g.names.map(n=>n.tokens),exact:new Set(g.names.map(n=>n.name.toLocaleLowerCase('sv'))),ids:new Set(g.buys.map(p=>p.venue+'|'+p.id)),times:new Set(g.buys.map(p=>p.date+'|'+p.venue)).size,venues:[...new Set(g.buys.map(p=>p.venue))],usual:prices.length%2?prices[mid]:Math.round((prices[mid-1]+prices[mid])/2)};});
}
// Hur en menyrätt hör till gruppen: 'exact' (samma rätt som köpts), 'similar' (liknande namn),
// 'variant' (kortare namn, t.ex. annan storlek; jämförs inte med vad du brukar betala) eller null.
export function matchKind(g,idf,venue,item,itemTokens){
 if(g.ids.has(venue+'|'+item.id)||g.exact.has(item.name.toLocaleLowerCase('sv')))return 'exact';
 // Snabb förkontroll: utan något gemensamt ord kan rätten inte matcha.
 g.vocab??=new Set(g.names.flat());if(!itemTokens.some(t=>g.vocab.has(t)))return null;
 if(g.names.some(n=>similarity(idf,n,itemTokens,false)>=THRESHOLD))return 'similar';
 return g.names.some(n=>similarity(idf,n,itemTokens)>=THRESHOLD)?'variant':null;
}
export const inGroup=(g,idf,venue,item,itemTokens)=>matchKind(g,idf,venue,item,itemTokens)!==null;
