// Read-only DOM extraction. Run with the approved browser tool's playwright.evaluate.
// Only visible menu fields are collected; no cookies, address, account or orders.
() => {
 const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
 const money=s=>{const m=(s||'').match(/([\d\s\u00a0]+,\d{2})\s*kr/);return m?Math.round(Number(m[1].replace(/\s/g,'').replace(',','.'))*100):null;};
 const seen=new Map();
 for(const h of document.querySelectorAll('[data-test-id="horizontal-item-card-header"]')){
  const c=h.closest('[id^="item-card-content-"]');if(!c)continue;
  const id=c.id.replace('item-card-content-',''),name=text(h),description=text(h.parentElement.querySelector('p'));
  const discount=c.querySelector('[data-test-id="horizontal-item-card-discounted-price"]'),original=c.querySelector('[data-test-id="horizontal-item-card-original-price"]'),normal=c.querySelector('[aria-label^="Pris "]');
  const price=money(text(discount||normal));if(price===null)continue;
  let category='';for(let p=c.parentElement;p&&p.tagName!=='MAIN';p=p.parentElement){const title=p.querySelector('h2');if(title){category=text(title);break;}}
  const row={id,name,description,category,price,originalPrice:money(text(original))||price,woltPlus:!!c.querySelector('[data-test-id="WoltPlusDiscountBadge"]'),offer:text(c.querySelector('[data-test-id="WoltPlusDiscountBadge"], [data-test-id="ItemDiscountBadge"]')),available:!/Inte tillgänglig/.test(text(c))};
  if(!seen.has(id)||!['Populärt','Nyligen köpta varor'].includes(category))seen.set(id,row);
 }
 return {observedAt:new Date().toISOString(),name:text(document.querySelector('h1')),url:location.href.split('?')[0],items:[...seen.values()]};
}
