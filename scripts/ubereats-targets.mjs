// Lista för Uber Eats-läsningen i webbläsaren (scripts/extract-ubereats.js): alla restauranger som läses på Wolt,
// med känd Uber Eats-länk när den finns. Utan länk tas bara de med som inte sökts de senaste 14 dagarna.
// node scripts/ubereats-targets.mjs [--all]   (--all: även de utan träff)
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadVenues,loadUberEatsLinks} from '../lib/store.mjs';
import {scrapeList} from '../lib/scrape.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const discovered=JSON.parse(await fs.readFile(new URL('../data/discovered.json',import.meta.url),'utf8').catch(()=>'{"venues":[]}')).venues||[];
const links=(await loadUberEatsLinks(root)).links,all=process.argv.includes('--all'),now=Date.now();
const out=scrapeList(await loadVenues(root),discovered).filter(v=>v.url).map(v=>({wolt:v.url,name:v.name,ubereats:v.ubereats||links[v.url]?.ubereats||null}))
 .filter(t=>t.ubereats||all||!links[t.wolt]||now-Date.parse(links[t.wolt].checkedAt)>14*864e5);
console.log(JSON.stringify(out));
