import test from 'node:test';
import assert from 'node:assert/strict';
import {fillUp,minGap} from '../lib/fillup.mjs';

const items=[{name:'Pommes',price:3500},{name:'Dipsås',price:1000},{name:'Läsk',price:2500},{name:'Milkshake',price:4500},{name:'Gratis',price:0}];
test('fill-up: closest to the minimum first, above and below',()=>{
 // 70 kr i korgen, minsta order 100 kr: läsk (95, 5 under) och pommes (105, 5 över) är lika nära; över går först.
 const l=fillUp(items,7000,10000);
 assert.deepEqual(l.map(i=>i.name),['Pommes','Läsk','Milkshake','Dipsås']);
 assert.deepEqual(l.map(i=>i.diff),[500,-500,1500,-2000]);
 assert.equal(l[0].total,10500);
});
test('fill-up: nothing when the minimum is reached or unknown',()=>{
 assert.deepEqual(fillUp(items,10000,10000),[]);assert.deepEqual(fillUp(items,7000,null),[]);
});
test('closest to minimum order sort: nearest first, above before below, unknown last',()=>{
 const l=[{n:'a',p:9500,m:10000},{n:'b',p:10500,m:10000},{n:'c',p:12000,m:10000},{n:'d',p:10000,m:null},{n:'e',p:10000,m:10000}];
 assert.deepEqual(l.sort((x,y)=>minGap(x.p,x.m)-minGap(y.p,y.m)).map(x=>x.n),['e','b','a','c','d']);
});
