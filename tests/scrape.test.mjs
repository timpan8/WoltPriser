import {test} from 'node:test';import assert from 'node:assert/strict';
import {mapWolt,imageUrl,localClock,searchWolt,fetchWolt} from '../lib/sources/wolt.mjs';
import {isDue,checkSnapshot,scrapeAll,lostWoltPlus} from '../lib/scrape.mjs';
import {validateBatch,emptyHistory,mergeHistory} from '../lib/prices.mjs';

const url='https://wolt.com/sv/swe/stockholm/restaurant/test';
const now='2026-10-03T14:20:00.000Z'; // lördag 16:20 i Stockholm
const it=(id,price,extra={})=>({id,name:'Rätt '+id,description:'  God\n rätt ',price,original_price:null,images:[{url:`https://wolt-menu-images-cdn.wolt.com/menu-images/shared/${id}.jpg`}],disabled_info:null,available_times:null,is_wolt_plus_only:false,...extra});
const assortment={loading_strategy:'full',categories:[
 {id:'c0',name:'Populärt',item_ids:['a'],subcategories:[]},
 {id:'c1',name:'Huvudrätter',item_ids:['a','b','c'],subcategories:[]},
 {id:'c2',name:'Pizza',item_ids:['d','e'],subcategories:[{id:'c2s',name:'Vita',item_ids:['f'],subcategories:[]}]},
 {id:'c3',name:'Lunch',item_ids:['g'],subcategories:[]}],
 items:[it('a',20100),it('b',15000,{original_price:18000}),it('c',9000,{disabled_info:{reason:'sold out'}}),it('d',16900),it('e',15900),it('f',17000),
  it('g',12000,{available_times:[{days:[1,2,3,4,5],start_time:37800000,end_time:50400000}]})]};
const disc=(title,effects,conditions={})=>({description:{title},effects:{basket_discount:null,item_discount:null,free_items:null,...effects},conditions:{delivery_methods:null,weekly_time_restrictions:null,has_wolt_plus:null,basket_contains:[],...conditions}});
const dynamic={venue_raw:{discounts:[
 disc('30% rabatt!',{item_discount:{fraction:0.3,include:{items:['a'],categories:null,cheapest_items:null},exclude:null}}),
 disc('-50% på pizza',{item_discount:{fraction:0.5,include:{items:null,categories:['c2']},exclude:{items:['e']}}},{has_wolt_plus:true}),
 disc('Köp 3, betala för 2',{free_items:{}},{basket_contains:[{any_of_items:['e']}]}),
 disc('60 kr rabatt över 180 kr',{basket_discount:{amount:6000}},{basket_contains:[{min_amount:18000}]}),
 disc('Lunchrabatt',{item_discount:{fraction:0.2,include:{items:['b']}}},{weekly_time_restrictions:[{start:630,end:840}]}),
 disc('Bara avhämtning',{item_discount:{fraction:0.9,include:{items:['b']}}},{delivery_methods:['takeaway']})]}};
const snap=mapWolt({assortment,dynamic,url,name:' Test ',now});
const by=Object.fromEntries(snap.items.map(i=>[i.id,i]));

test('Stockholm clock handles weekday and summer time',()=>{assert.deepEqual(localClock(now),{day:6,ms:(16*60+20)*3600000/60,minuteOfWeek:5*1440+980});});
test('item discount lowers price and keeps original, category skips Populärt',()=>{assert.equal(by.a.price,14070);assert.equal(by.a.originalPrice,20100);assert.equal(by.a.offer,'30% rabatt!');assert.equal(by.a.category,'Huvudrätter');assert.equal(by.a.woltPlus,false);});
test('venue strike-through price becomes originalPrice; inactive and takeaway-only discounts ignored',()=>{assert.equal(by.b.price,15000);assert.equal(by.b.originalPrice,18000);assert.equal(by.b.offer,'');});
test('category discount reaches subcategories, marks Wolt+, respects exclude',()=>{assert.equal(by.d.price,8450);assert.equal(by.d.woltPlus,true);assert.equal(by.f.price,8500);assert.equal(by.f.category,'Pizza');assert.equal(by.e.price,15900);assert.equal(by.e.offer,'Köp 3, betala för 2');});
test('sold out and outside opening hours are unavailable; basket discounts are not offers',()=>{assert.equal(by.c.available,false);assert.equal(by.g.available,false);assert.equal(by.d.available,true);assert.equal(by.g.offer,'');});
test('text is normalised and images point to imageproxy',()=>{assert.equal(by.a.description,'God rätt');assert.equal(snap.name,'Test');assert.equal(by.a.image,'https://imageproxy.wolt.com/menu/menu-images/shared/a.jpg');assert.equal(imageUrl('https://evil.example/x.jpg'),'');});
test('mapped snapshot passes import validation',()=>{assert.equal(validateBatch({snapshots:[snap]})[0].items.length,7);});

const reading=(iso)=>({url,name:'Test',observedAt:iso,items:7});
test('isDue: after 16 local, once per day, works in winter and summer',()=>{const h=emptyHistory();
 assert.equal(isDue(h,'2026-10-03T13:59:00Z'),false);assert.equal(isDue(h,'2026-10-03T14:05:00Z'),true);
 assert.equal(isDue({...h,readings:[reading('2026-10-03T14:10:00Z')]},'2026-10-03T15:05:00Z'),false);
 assert.equal(isDue({...h,readings:[reading('2026-10-03T08:00:00Z')]},'2026-10-03T15:05:00Z'),true);
 assert.equal(isDue(h,'2026-12-03T14:05:00Z'),false);assert.equal(isDue(h,'2026-12-03T15:05:00Z'),true);});
test('sanity check rejects empty menus and big drops',()=>{assert.equal(checkSnapshot({items:[]},10),'tom meny');assert.match(checkSnapshot({items:[1,2]},10),/bara 2/);assert.equal(checkSnapshot({items:Array(8)},10),'');});

// Falskt nätverk som svarar som Wolt.
const fakeFetch=(routes)=>async(u,init)=>{const r=Object.entries(routes).find(([k])=>u.includes(k));if(!r)return new Response('nope',{status:404});const v=typeof r[1]==='function'?r[1](u,init):r[1];return v instanceof Response?v:Response.json(v);};
test('fetchWolt combines assortment and campaigns, and fails rather than saving prices without campaigns',async()=>{
 const ok=await fetchWolt({name:'Test',url},{lat:1,lon:2,now,fetchImpl:fakeFetch({'/assortment':assortment,'/dynamic/':dynamic})});assert.equal(ok.snapshot.items.find(i=>i.id==='a').price,14070);assert.equal(ok.warning,'');
 await assert.rejects(fetchWolt({name:'Test',url},{lat:1,lon:2,now,fetchImpl:fakeFetch({'/assortment':assortment,'/dynamic/':()=>new Response('x',{status:403})})}),/kampanjer kunde inte läsas/);});
test('search needs one exact name match',async()=>{const res={sections:[{items:[{venue:{name:'Bröd & Salt Skanstull',slug:'brod-salt'}},{venue:{name:'Bröd & Salt Hornstull',slug:'brod-salt-h'}}]}]};
 assert.deepEqual(await searchWolt('bröd & salt skanstull',{fetchImpl:fakeFetch({'/pages/search':res})}),{name:'Bröd & Salt Skanstull',url:'https://wolt.com/sv/swe/stockholm/restaurant/brod-salt'});
 assert.equal(await searchWolt('Bröd & Salt',{fetchImpl:fakeFetch({'/pages/search':res})}),null);});
test('scrapeAll retries a short menu once, reports failures and keeps going',async()=>{
 const history=mergeHistory(emptyHistory(),{snapshots:[{...snap,observedAt:'2026-10-02T14:20:00.000Z'}]});
 let calls=0;const short={...assortment,items:assortment.items.slice(0,2)};
 const fetchImpl=fakeFetch({'/slug/test/assortment':()=>++calls===1?short:assortment,'/slug/test/dynamic/':dynamic,'/slug/broken/assortment':new Response('x',{status:404}),'/pages/search':{sections:[]}});
 const venues=[{name:'Test',url},{name:'Broken',url:'https://wolt.com/sv/swe/stockholm/restaurant/broken'},{name:'Okänd'}];
 const r=await scrapeAll({venues,history,lat:1,lon:2,now,fetchImpl,retryDelay:0,pause:async()=>{}});
 assert.equal(calls,2);assert.equal(r.ok.length,1);assert.deepEqual(r.failed.map(f=>f.venue.name+': '+f.error),['Broken: HTTP 404 från consumer-api.wolt.com','Okänd: ingen entydig träff på Wolt']);});
test('a Wolt+ price that disappears is reported, a normal campaign ending is not',()=>{
 const before={...snap,observedAt:'2026-10-02T14:20:00.000Z'};const history=mergeHistory(emptyHistory(),{snapshots:[before]});
 const after={...snap,items:snap.items.map(i=>i.id==='d'?{...i,price:i.originalPrice,woltPlus:false}:i.id==='a'?{...i,price:i.originalPrice,offer:''}:i)};
 assert.deepEqual(lostWoltPlus(history,after),['Rätt d']);assert.deepEqual(lostWoltPlus(history,snap),[]);assert.deepEqual(lostWoltPlus(emptyHistory(),after),[]);});
