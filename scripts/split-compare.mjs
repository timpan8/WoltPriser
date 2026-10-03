// Delar jämförelsefilerna (data/foodora.json, data/ubereats.json) vid publicering: restauranger kopplade till Wolt
// (nyckeln är Wolt-länken) stannar i huvudfilen, resten (restauranger utanför Wolt, oftast det mesta) läggs i
// <namn>-other.json. Sidan hämtar den andra filen bara när väljaren Appar visar restauranger utanför Wolt.
// Användning: node scripts/split-compare.mjs <utkatalog> [namn …]
import fs from 'node:fs/promises';
import {isWoltKey} from '../lib/foodora.mjs';

export function splitStore(store,name){
 const main={},other={};for(const [k,v] of Object.entries(store?.venues||{}))(isWoltKey(k)?main:other)[k]=v;
 const n=Object.keys(other).length;
 return {main:{...store,venues:main,...(n?{other:n,otherFile:`${name}-other.json`}:{})},other:n?{version:store.version,venues:other}:null};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const [out,...names]=process.argv.slice(2);
 for(const name of names.length?names:['foodora','ubereats']){
  const src=new URL(`../data/${name}.json`,import.meta.url);let store;try{store=JSON.parse(await fs.readFile(src,'utf8'));}catch{continue;}
  const {main,other}=splitStore(store,name);
  await fs.writeFile(`${out}/${name}.json`,JSON.stringify(main));if(other)await fs.writeFile(`${out}/${name}-other.json`,JSON.stringify(other));
  console.log(`${name}: ${Object.keys(main.venues).length} kopplade till Wolt, ${main.other||0} utanför Wolt`);}
}
