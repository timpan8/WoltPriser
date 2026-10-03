// Importerar jämförelsepriser från en fil: node scripts/import-compare.mjs <fil.json>
// Filen har samma format som importformuläret: { "foodora": [...] } och/eller { "ubereats": [...] } med avläsningar
// från scripts/extract-foodora.js (eller mapUberEats). Avläsningar utan "wolt" gäller restauranger som inte finns på Wolt.
// Hela batchen valideras innan något sparas; äldre avläsningar än de sparade hoppas över.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {saveCompare} from '../lib/store.mjs';
import {FOODORA,UBEREATS,validateFoodora} from '../lib/foodora.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),file=process.argv[2];
if(!file){console.error('Ange filen: node scripts/import-compare.mjs <fil.json>');process.exit(1);}
const batch=JSON.parse(await fs.readFile(file,'utf8')),apps=[FOODORA,UBEREATS].filter(p=>Array.isArray(batch[p.key]));
if(!apps.length){console.error('Filen saknar "foodora" eller "ubereats".');process.exit(1);}
for(const p of apps)for(let k=0;k<batch[p.key].length;k+=100)validateFoodora({[p.key]:batch[p.key].slice(k,k+100)},p);
for(const p of apps){const list=batch[p.key],store=await saveCompare(root,p,list),own=list.filter(s=>!s.wolt).length;
 console.log(`${p.label}: ${list.length} avläsningar (${own} utan Wolt), ${Object.keys(store.venues).length} restauranger i data/${p.key}.json`);}
