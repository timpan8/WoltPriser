// Read-only DOM extraction of an open Foodora restaurant page (https://www.foodora.se/restaurant/<kod>/<namn>).
// Only visible menu fields are collected; no cookies, address, account, cart or orders.
// Foodora visar samma rätt både i sin vanliga kategori och i "PRO-DEALS" (pris för foodora pro);
// den vanliga raden ger pris och ordinarie pris, PRO-raden ger proPrice.
() => {
 const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
 const kr=s=>{const m=(s||'').match(/(\d[\d\s ]*(?:,\d{1,2})?)\s*kr/);return m?Math.round(Number(m[1].replace(/[\s ]/g,'').replace(',','.'))*100):null;};
 const key=s=>s.toLocaleLowerCase('sv').replace(/\s+/g,' ').trim();
 const regular=new Map(),pro=new Map();
 for(const p of document.querySelectorAll('[data-testid="menu-product"]')){
  const name=text(p.querySelector('[data-testid="menu-product-name"]')),priceText=text(p.querySelector('[data-testid="menu-product-price"]'));
  const price=kr(priceText);if(!name||price===null)continue;
  const category=text(p.closest('[data-testid="menu-category-section"]')?.querySelector('[data-testid="menu-category-section-title"]'));
  const struck=[...p.querySelectorAll('*')].find(e=>e.children.length===0&&/kr/.test(e.textContent)&&getComputedStyle(e).textDecorationLine.includes('line-through'));
  const row={name,category,price,originalPrice:Math.max(price,kr(text(struck))||price),from:/^från\b/i.test(priceText)};
  if(/pro/i.test(category)&&/deal/i.test(category)){if(!pro.has(key(name))||pro.get(key(name)).price>price)pro.set(key(name),row);continue;}
  const k=key(name),prev=regular.get(k);
  // Samma rätt i flera kategorier (t.ex. Populärt): behåll den med kategori; olika pris = olika rätter.
  if(!prev||(!prev.category&&row.category&&prev.price===row.price))regular.set(k,row);
  else if(prev.price!==row.price&&!regular.has(k+'|'+row.price))regular.set(k+'|'+row.price,row);
 }
 const items=[...regular].map(([id,r])=>{const pp=pro.get(key(r.name));return {id,...r,proPrice:pp&&pp.price<r.price?pp.price:null};});
 // Rätter som bara finns under PRO-DEALS: ordinarie pris är det överstrukna, pro-priset det visade.
 for(const [k,r] of pro)if(!regular.has(k))items.push({id:k,...r,price:r.originalPrice,proPrice:r.price<r.originalPrice?r.price:null});
 return {observedAt:new Date().toISOString(),name:text(document.querySelector('h1')),url:location.origin+location.pathname,items};
}
