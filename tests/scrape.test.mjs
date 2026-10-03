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
import {parseVenueList} from '../lib/sources/wolt.mjs';
import {scrapeList} from '../lib/scrape.mjs';
import {mergeVenues} from '../lib/prices.mjs';
test('the venue list keeps restaurants that deliver, skips shops and duplicates, wherever they sit in the response',()=>{
 const json={sections:[{items:[{venue:{slug:'ellora',name:' Restaurang  Ellora ',delivers:true,product_line:'restaurant',rating:{score:9.2},tags:['Indiskt',{name:'Curry'}],estimate:30}},{venue:{slug:'coop-zinken',name:'Coop Zinken',delivers:true,product_line:'grocery'}}]},
  {items:[{link:{target:'x'},venue:{slug:'far-away',name:'Långt bort',delivers:false,product_line:'restaurant'}},{venue:{slug:'ellora',name:'Restaurang Ellora',delivers:true}}]},{nested:{deep:[{slug:'pizza',name:'Pizza',online:true}]}}]};
 assert.deepEqual(parseVenueList(json),[{name:'Restaurang Ellora',url:'https://wolt.com/sv/swe/stockholm/restaurant/ellora',rating:9.2,tags:['Indiskt','Curry'],estimate:30},{name:'Pizza',url:'https://wolt.com/sv/swe/stockholm/restaurant/pizza',rating:null,tags:[],estimate:null}]);
 assert.deepEqual(parseVenueList({}),[]);});
test('your restaurants come first and discovered ones are added once',()=>{const mine=[{name:'A',url:'u/a'},{name:'Bara namn'}];
 assert.deepEqual(scrapeList(mine,[{name:'A igen',url:'u/a'},{name:'B',url:'u/b'},{name:'B',url:'u/b'}]),[{name:'A',url:'u/a'},{name:'Bara namn'},{name:'B',url:'u/b',discovered:true}]);});
test('discovered restaurants do not become yours in venues.json, but name-only entries still get their link',()=>{
 const h=mergeHistory(emptyHistory(),{snapshots:[{...snap,observedAt:'2026-10-02T14:20:00.000Z'},{...snap,name:'Ny',url:'https://wolt.com/sv/swe/stockholm/restaurant/ny',observedAt:'2026-10-02T14:21:00.000Z'}]});
 assert.deepEqual(mergeVenues([{name:'test'}],h,{addNew:false}),[{name:'Test',url}]);assert.equal(mergeVenues([{name:'test'}],h).length,2);});
test('a daily reading of hundreds of restaurants can be saved in one go',()=>{const many=Array.from({length:600},(_,k)=>({...snap,url:url+'-'+k,observedAt:'2026-10-02T14:20:00.000Z'}));
 const h=mergeHistory(emptyHistory(),{snapshots:many});assert.equal(h.readings.length,600);const again=mergeHistory(h,{snapshots:many.map(s=>({...s,observedAt:'2026-10-03T14:20:00.000Z'}))});assert.equal(again.readings.length,1200);});

// Uber Eats ---------------------------------------------------------------------------------------
import {mapUberEats,storeUuid,storeUrl,struckPrice,fetchUberEats,nameKey,sameName,pickStore,parseStoreList} from '../lib/sources/ubereats.mjs';
import {scrapeUberEats,ingestUberEats} from '../lib/scrape.mjs';
import {readFileSync} from 'node:fs';
import {mergeFoodora,foodoraMenu,matchFoodora,UBEREATS} from '../lib/foodora.mjs';
const ueUrl='https://www.ubereats.com/se/store/burger-king-arsta/yl7fgcXeSFaVG-AwkndQfg';
const tag=(p,o)=>({text:`${p},00 kr`,accessibilityText:o?`${p},00 kr, discounted from ${o},00 kr`:`${p},00 kr`,textFormat:o?`<span><span style="color:#05944F">${p},00 kr </span><span style="text-decoration:line-through;color:#757575;baseline-shift:0px">${o},00 kr</span></span>`:`<span>${p},00 kr</span>`});
const ci=(uuid,title,price,orig,extra={})=>({uuid,title,price:price*100,priceTagline:tag(price,orig),isSoldOut:false,isAvailable:true,...extra});
const ueStore={title:'Burger King Årsta',catalogSectionsMap:{s:[
 {type:'HORIZONTAL_GRID',payload:{standardItemsPayload:{title:{text:'Utvalda objekt'},catalogItems:[ci('w1','Whopper Cheese Meal',124,155)]}}},
 {type:'VERTICAL_GRID',payload:{standardItemsPayload:{title:{text:'FLAME-GRILLED MENYER'},catalogItems:[ci('w1','Whopper Cheese Meal',124,155),ci('w2','Whopper Meal',145),ci('w3','Big King',69,null,{isSoldOut:true})]}}}]}};
test('Uber Eats store links round-trip to the store uuid',()=>{assert.equal(storeUuid(ueUrl),'ca5edf81-c5de-4856-951b-e0309277507e');assert.equal(storeUrl('burger-king-arsta','ca5edf81-c5de-4856-951b-e0309277507e'),ueUrl);assert.match(storeUrl('muskot-kok-&-bar','18a38c0e-875f-5c31-945a-d38f54895ef5'),/muskot-kok-%26-bar\//);});
test('Uber Eats menu: real category wins, struck price is the original, sold out is skipped',()=>{
 const s=mapUberEats({store:ueStore,url:ueUrl,wolt:url,name:' BK ',now});
 assert.deepEqual(s.items.map(i=>[i.id,i.category,i.price,i.originalPrice]),[['w1','FLAME-GRILLED MENYER',12400,15500],['w2','FLAME-GRILLED MENYER',14500,14500]]);
 assert.equal(struckPrice(tag(99)),null);assert.equal(mergeFoodora(null,{ubereats:[s]},UBEREATS).venues[url].items.w1.log[0][1],12400);});
test('Uber Eats restaurants that are not on Wolt need a known link and are stored under it',()=>{
 const r=ingestUberEats([{name:'Utan länk',stores:[ueStore],observedAt:now},{name:'BK',ubereats:ueUrl,stores:[ueStore],observedAt:now}],{store:null,now});
 assert.deepEqual(r.failed.map(f=>f.error),['Uber Eats-länk saknas.']);assert.equal(r.ok.length,1);assert.deepEqual(Object.keys(r.links.links),[]);
 assert.deepEqual(Object.keys(mergeFoodora(null,{ubereats:r.ok.map(x=>x.snapshot)},UBEREATS).venues),[ueUrl]);});
test('Uber Eats links are validated like Foodora links',()=>{const s=mapUberEats({store:ueStore,url:'https://evil.example/se/store/x/yl7fgcXeSFaVG-AwkndQfg',wolt:url,name:'BK',now});assert.throws(()=>mergeFoodora(null,{ubereats:[s]},UBEREATS),/Uber Eats-länk/);});
test('scrapeUberEats reads linked venues, rejects big drops and keeps going',async()=>{
 const store=mergeFoodora(null,{ubereats:[{...mapUberEats({store:ueStore,url:ueUrl,wolt:url,name:'BK',now:'2026-10-02T14:00:00Z'}),items:Array.from({length:10},(_,k)=>({id:'x'+k,name:'R'+k,category:'',price:100,originalPrice:100,proPrice:null,from:false}))}]},UBEREATS);
 const fetchImpl=fakeFetch({'/getStoreV1':(u,init)=>JSON.parse(init.body).storeUuid.startsWith('ca5e')?{status:'success',data:ueStore}:new Response('x',{status:404})});
 const other='https://wolt.com/sv/swe/stockholm/restaurant/other';
 const r=await scrapeUberEats({venues:[{name:'BK',url,ubereats:ueUrl},{name:'Annan',url:other,ubereats:'https://www.ubereats.com/se/store/x/AAAAAAAAAAAAAAAAAAAAAA'},{name:'Utan',url:other}],store,fetchImpl,now,searchLimit:0,pause:async()=>{}});
 assert.equal(r.ok.length,0);assert.deepEqual(r.failed.map(f=>f.venue.name+': '+f.error.slice(0,10)),['BK: bara 2 rät','Annan: HTTP 404 f']);
 const fresh=await scrapeUberEats({venues:[{name:'BK',url,ubereats:ueUrl}],store:null,fetchImpl,now,pause:async()=>{}});assert.equal(fresh.ok[0].snapshot.items.length,2);});
test('venues keep their Foodora and Uber Eats links when readings are merged',()=>{const v=mergeVenues([{name:'Test',url,foodora:'https://www.foodora.se/restaurant/ab12/x',ubereats:ueUrl}],mergeHistory(emptyHistory(),{snapshots:[snap]}));assert.equal(v[0].ubereats,ueUrl);assert.equal(v[0].foodora,'https://www.foodora.se/restaurant/ab12/x');});
test('second-pass name match: parentheses and the word pizza, only unique and with a sane price',()=>{
 const items=[['a','Chicken Madras (Stark)',18900],['b','Capricciosa Pizza',15500],['c','Naan (1 st)',3200],['d','Naan (2 st)',5500],['e','Lassi',99000]].map(([id,name,price])=>({id,name,category:'',price,originalPrice:price,proPrice:null,from:false}));
 const m=foodoraMenu(mergeFoodora(null,{ubereats:[{url:ueUrl,wolt:url,name:'X',observedAt:now,items}]},UBEREATS),url);
 const hit=matchFoodora(m,{name:'Chicken Madras',price:19500});assert.equal(hit.id,'a');assert.equal(hit.similar,true);
 assert.equal(matchFoodora(m,{name:'Capricciosa',price:16500}).id,'b');assert.equal(matchFoodora(m,{name:'Naan',price:4000}),null);assert.equal(matchFoodora(m,{name:'Lassi (mango)',price:4000}),null);
 assert.equal(matchFoodora(m,{name:'Chicken Madras (Stark)',price:1}).similar,undefined);});
test('a bot-check page instead of JSON gives a clear error',async()=>{await assert.rejects(fetchUberEats({name:'BK',url,ubereats:ueUrl},{fetchImpl:async()=>new Response('<html>challenge</html>',{status:200})}),/kontrollsida/);});

// Uber Eats för alla restauranger: sökning på namn, val av butik nära positionen, länkar som sparas.
const U1='ca5edf81-c5de-4856-951b-e0309277507e',U2='11111111-2222-4333-8444-555555555555',U3='99999999-2222-4333-8444-555555555555';
const near={latitude:59.30,longitude:18.05},far={latitude:59.85,longitude:17.64};// Årsta resp. Uppsala
const ueData={[U1]:{...ueStore,uuid:U1,slug:'burger-king-arsta',title:'Burger King',location:near},[U2]:{...ueStore,uuid:U2,slug:'burger-king-uppsala',title:'Burger King',location:far},[U3]:{...ueStore,uuid:U3,slug:'bk-cafe',title:'Kafé Annat',location:near}};
const searchFeed={feedItems:[{type:'REGULAR_STORE',store:{storeUuid:U2,title:{text:'Burger King'}}},{store:{storeUuid:U1,title:{text:'Burger King'}}},{store:{storeUuid:U3,title:{text:'Kafé Annat'}}}]};
test('Uber Eats names match across apps, but not loosely',()=>{
 assert.equal(nameKey('Restaurang Ellora - Södermalm'),'ellora');assert.equal(sameName('Café Älvan','Cafe Alvan (Årsta)'),2);
 assert.equal(sameName('Piatto Fresco','Piatto Fresco Årstaberg'),1);assert.equal(sameName('Max','Max Medborgarplatsen'),0);assert.equal(sameName('Sushi Bar','Sushi Yama'),0);
 assert.deepEqual(parseStoreList(searchFeed).map(s=>s.uuid),[U2,U1,U3]);});
test('pickStore takes the nearest store with the same name and never one far away',()=>{
 const pos={lat:59.299,lon:18.052};
 assert.equal(pickStore({name:'Burger King',stores:[ueData[U2],ueData[U1]],...pos}).uuid,U1);
 assert.equal(pickStore({name:'Burger King',stores:[ueData[U2]],...pos}),null);
 assert.equal(pickStore({name:'Burger King Medborgarplatsen',stores:[{...ueData[U1],location:far}],...pos}),null);
 assert.equal(pickStore({name:'Burger',stores:[ueData[U1]],...pos}),null);});
test('scrapeUberEats searches unlinked venues, remembers misses and respects the search limit',async()=>{
 const calls=[];const fetchImpl=fakeFetch({'/getSearchFeedV1':(u,init)=>{calls.push(JSON.parse(init.body).userQuery);assert.match(init.headers.cookie,/^uev2\.loc=/);return {status:'success',data:JSON.parse(init.body).userQuery==='Burger King'?searchFeed:{feedItems:[]}};},
  '/getStoreV1':(u,init)=>({status:'success',data:ueData[JSON.parse(init.body).storeUuid]})});
 const w=n=>`https://wolt.com/sv/swe/stockholm/restaurant/${n}`,venues=[{name:'Burger King',url:w('bk')},{name:'Okänd',url:w('okand')},{name:'Tredje',url:w('tredje')}];
 const r=await scrapeUberEats({venues,store:null,fetchImpl,now,searchLimit:2,pause:async()=>{}});
 assert.deepEqual(calls,['Burger King','Okänd']);assert.equal(r.searched,2);assert.equal(r.found,1);assert.equal(r.ok.length,1);
 assert.equal(r.ok[0].snapshot.wolt,w('bk'));assert.equal(r.links.links[w('bk')].ubereats,storeUrl('burger-king-arsta',U1));assert.equal(r.links.links[w('okand')].ubereats,null);assert.equal(r.links.links[w('tredje')],undefined);
 assert.equal(mergeFoodora(null,{ubereats:r.ok.map(x=>x.snapshot)},UBEREATS).venues[w('bk')].name,'Burger King');
 calls.length=0;const next=await scrapeUberEats({venues,store:null,links:r.links,fetchImpl,now,pause:async()=>{}});
 assert.deepEqual(calls,['Tredje']);assert.equal(next.ok.length,1);
 const later=await scrapeUberEats({venues,store:null,links:next.links,fetchImpl,now:'2026-11-01T12:00:00Z',pause:async()=>{}});assert.equal(later.searched,2);
 let hits=0;const blocked=await scrapeUberEats({venues,store:null,fetchImpl:async()=>{hits++;return new Response('denied',{status:403});},now,pause:async()=>{}});
 assert.match(blocked.blocked,/HTTP 403/);assert.equal(blocked.failed.length,0);assert.ok(hits<=2,'stops after the block');assert.equal(blocked.links.links[w('bk')],undefined);
 const parse=await scrapeUberEats({venues:venues.slice(0,1),store:null,fetchImpl:fakeFetch({'/getSearchFeedV1':{status:'failure'}}),now,pause:async()=>{}});
 assert.equal(parse.blocked,null);assert.equal(parse.failed[0].search,true);});
test('browser fallback: extract-ubereats.js output is imported like the cloud reading',async()=>{
 const fn=eval(readFileSync(new URL('../scripts/extract-ubereats.js',import.meta.url),'utf8').replace(/^\/\/.*\n/gm,''));
 const real=globalThis.fetch,realTimeout=globalThis.setTimeout;
 globalThis.fetch=async(p,init)=>{const b=JSON.parse(init.body);return new Response(JSON.stringify(p.includes('getSearchFeedV1')?{status:'success',data:searchFeed}:ueData[b.storeUuid]?{status:'success',data:{...ueData[b.storeUuid],extra:'x'.repeat(50)}}:{status:'failure'}));};
 globalThis.setTimeout=f=>realTimeout(f,0);
 try{
  const w=n=>`https://wolt.com/sv/swe/stockholm/restaurant/${n}`;
  const out=await fn([{wolt:w('bk'),name:'Burger King',ubereats:null},{wolt:w('max'),name:'Max',ubereats:storeUrl('x','00000000-0000-4000-8000-000000000000')},{wolt:w('kafe'),name:'Kafé Annat',ubereats:storeUrl('bk-cafe',U3)}]);
  assert.equal(out[0].stores.length,3);assert.equal(out[0].stores[0].extra,undefined);assert.match(out[1].error,/utan data/);
  const r=ingestUberEats(out,{store:null,now});
  assert.deepEqual(r.ok.map(x=>x.venue.name),['Burger King','Kafé Annat']);assert.equal(r.failed.length,1);
  assert.equal(r.links.links[w('bk')].ubereats,storeUrl('burger-king-arsta',U1));assert.equal(r.links.links[w('kafe')],undefined);
  const cloud=mapUberEats({store:ueData[U1],url:storeUrl('burger-king-arsta',U1),wolt:w('bk'),name:'Burger King',now});
  assert.deepEqual(r.ok[0].snapshot.items,cloud.items);
 }finally{globalThis.fetch=real;globalThis.setTimeout=realTimeout;}});
test('venue rating is read tolerantly from the venue response',async()=>{const {venueRating}=await import('../lib/sources/wolt.mjs');
 assert.equal(venueRating({venue_raw:{name:'X',rating:{rating:4,score:8.6,volume:200}}}),8.6);assert.equal(venueRating({venue:{rating:{score:0}}}),null);assert.equal(venueRating({}),null);assert.equal(venueRating(null),null);});
test('rating falls back to the static venue data, then to search, and never fails the reading',async()=>{const {ratingFor}=await import('../lib/sources/wolt.mjs');
 assert.equal(await ratingFor('x','X',{fetchImpl:fakeFetch({'/static/':{venue:{rating:{score:9.1}}}})}),9.1);
 assert.equal(await ratingFor('x','X',{fetchImpl:fakeFetch({'/v1/pages/search':{sections:[{items:[{venue:{slug:'y',rating:{score:5}}},{venue:{slug:'x',rating:{score:8.2}}}]}]}})}),8.2);
 assert.equal(await ratingFor('x','X',{fetchImpl:async()=>{throw Error('nät');}}),null);});
test('opening hours and minimum order are read from several Wolt formats',async()=>{const {venueInfo}=await import('../lib/sources/wolt.mjs');
 const ms=h=>({$date:h*3600000});
 const a=venueInfo({venue:{opening_times:{monday:[{type:'open',value:ms(10)},{type:'close',value:ms(22)}],sunday:[{type:'open',value:ms(12)},{type:'close',value:ms(1)}]},delivery_specs:{order_minimum_no_surcharge:15000}}});
 assert.deepEqual(a.hours,{mon:[[600,1320]],sun:[[720,1500]]});assert.equal(a.minOrder,15000);
 const b=venueInfo({delivery_times:{tuesday:[{open:'11:00',close:'21:30'}]},opening_times:{tuesday:[{open:'10:00',close:'22:00'}]}});assert.deepEqual(b.hours,{tue:[[660,1290]]});
 assert.deepEqual(venueInfo({x:1}),{hours:null,minOrder:null});assert.deepEqual(venueInfo(null),{hours:null,minOrder:null});});
