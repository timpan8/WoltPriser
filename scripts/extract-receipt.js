// Read-only DOM extraction of one open Wolt receipt (wolt.com/sv/me/order-history/<id>).
// Collects only restaurant name, order date (day), status, dish id/name/price/count, option cost, delivery fee and discount sum.
// No order id, time, address, phone, payment method or totals leave the page.
() => {
 const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
 const kr=s=>{const m=(s||'').match(/([\d\s ]+,\d{2})/);return m?Math.round(Number(m[1].replace(/\s/g,'').replace(',','.'))*100):0;};
 const main=document.querySelector('main'),all=text(main);
 const items=[...main.querySelectorAll('[data-test-id^="OrderDetailsItemName."]')].map(n=>{
  const info=n.closest('[data-test-id="OrderDetailsItemInfo"]'),row=info.parentElement;
  const options=[...row.querySelectorAll('ul li')].reduce((sum,li)=>{const m=text(li).match(/\+\s*([\d\s ]+,\d{2})/);return sum+(m?kr(m[1]):0);},0);
  return {id:n.dataset.testId.split('.')[1],name:text(n),price:kr(text(info.querySelector('[data-test-id="OrderDetailsItemPrice"]'))),count:Number(text(info.querySelector('[data-test-id="OrderDetailsItemCount"]')).replace(/\D/g,''))||1,options};
 });
 return {
  venue:text(main.querySelector('h2')),
  date:(all.match(/Beställning placerad:\s*(\d{4}-\d\d-\d\d)/)||[])[1]||null,
  status:(all.match(/Beställningsstatus\s*(\S+)/)||[])[1]||'',
  items,
  delivery:kr(text(main.querySelector('[data-test-id="RowWithSubItems-MainRow"] td:last-child'))),
  discount:[...main.querySelectorAll('[data-test-id^="OrderDetailsWoltDiscount"]')].reduce((s,d)=>s+kr(text(d.lastElementChild)),0)
 };
}
