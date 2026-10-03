// Bygger den publicerade historiken: grunddatan (data/history.json) med dina priser (data/member.json) ovanpå.
// node scripts/build-data.mjs <utmapp>   (används av pages.yml; skriver <utmapp>/history.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadHistory,loadMember} from '../lib/store.mjs';
import {effectiveHistory} from '../lib/member.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.argv[2];
if(!out){console.error('Ange utmapp, t.ex. _site/data');process.exit(1);}
const [base,member]=await Promise.all([loadHistory(root),loadMember(root)]);
const h=effectiveHistory(base,member);
await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'history.json'),JSON.stringify(h));
console.log(`history.json: ${base.readings.length} grundavläsningar + ${member.readings.length} egna → ${h.readings.length} avläsningar`);
