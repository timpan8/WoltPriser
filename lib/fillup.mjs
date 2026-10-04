// Fyll upp till minsta ordervärde: en rätt till från samma restaurang, ordnad efter hur nära delsumman plus rättens pris
// hamnar minsta ordervärdet (över eller under). Lika nära: över före under (ingen avgift), sedan billigast.
// items: [{price, ...}] i öre. Returnerar kopior med total (ny delsumma) och diff (total − min; negativ = fortfarande under).
export function fillUp(items,sum,min){
 if(!(min>0)||sum>=min)return [];
 return items.filter(i=>i.price>0).map(i=>({...i,total:sum+i.price,diff:sum+i.price-min}))
  .sort((a,b)=>Math.abs(a.diff)-Math.abs(b.diff)||(b.diff>=0)-(a.diff>=0)||a.price-b.price);
}
