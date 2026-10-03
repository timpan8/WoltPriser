import {test} from 'node:test';import assert from 'node:assert/strict';
import {effectiveHistory,freshMemberPrices} from '../lib/member.mjs';
import {mergeHistory,emptyHistory,expandVenue,latestSnapshots} from '../lib/prices.mjs';
import {lostWoltPlus} from '../lib/scrape.mjs';
const url='https://wolt.com/sv/swe/stockholm/restaurant/piatto';
const it=(id,price,originalPrice,woltPlus=false)=>({id,name:'Rätt '+id,description:'',category:'Pizza',price,originalPrice,woltPlus,offer:woltPlus?'-50% med Wolt+':'',available:true});
const snap=(day,items)=>({url,name:'Piatto',observedAt:`2026-09-${day}T14:10:00.000Z`,items});
const hist=(...snaps)=>mergeHistory(emptyHistory(),{snapshots:snaps});
const latest=h=>Object.fromEntries(latestSnapshots(h)[0].items.map(i=>[i.id,i]));
// I dag: inloggad läsning med Wolt+-pris. I morgon: skrapan utan inloggning ser fullpris.
const mine=hist(snap('03',[it('a',10000,20000,true),it('b',15000,15000)]));
const base=hist(snap('03',[it('a',10000,20000,true),it('b',15000,15000)]),snap('04',[it('a',20000,20000),it('b',15000,15000)]));

test('your fresh Wolt+ price is laid over the base price',()=>{const a=latest(effectiveHistory(base,mine)).a;assert.equal(a.price,10000);assert.equal(a.woltPlus,true);assert.equal(a.offer,'-50% med Wolt+');});
test('the price history does not jump when the scraper cannot see Wolt+',()=>{const h=effectiveHistory(base,mine);assert.deepEqual(expandVenue(h,url).map(s=>s.items.find(i=>i.id==='a').price),[10000,10000]);});
test('own prices older than 7 days are not used',()=>{const later=hist(snap('03',[it('a',10000,20000,true)]),snap('11',[it('a',20000,20000)]));assert.equal(latest(effectiveHistory(later,mine)).a.price,20000);});
test('a changed ordinary price means your old price no longer applies',()=>{const raised=hist(snap('04',[it('a',22000,22000)]));assert.equal(latest(effectiveHistory(raised,mine)).a.price,22000);});
test('a lower base price (new public campaign) wins over your older price',()=>{const cheaper=hist(snap('04',[it('a',8000,20000)]));assert.equal(latest(effectiveHistory(cheaper,mine)).a.price,8000);});
test('without own prices the base history is unchanged, and own readings count as readings',()=>{assert.equal(effectiveHistory(base,null),base);const newer=hist(snap('05',[it('a',9000,20000,true)]));const h=effectiveHistory(base,newer);assert.equal(h.readings.length,3);assert.equal(latest(h).a.price,9000);});
test('the scraper does not warn about Wolt+ prices you have a fresh own price for',()=>{const scraped=snap('04',[it('a',20000,20000),it('b',15000,15000)]);const prev=hist(snap('03',[it('a',10000,20000,true),it('b',15000,15000)]));
 assert.deepEqual(lostWoltPlus(prev,scraped),['Rätt a']);assert.deepEqual(lostWoltPlus(prev,scraped,freshMemberPrices(mine,scraped.observedAt)),[]);
 assert.deepEqual(lostWoltPlus(prev,{...scraped,observedAt:'2026-09-12T14:10:00.000Z'},freshMemberPrices(mine,'2026-09-12T14:10:00.000Z')),['Rätt a']);});
