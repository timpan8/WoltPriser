// Schemalagd prisinsamling: node scripts/scrape.mjs [--dry-run] [--if-due] [--only=text] [--limit=N]
// Läser data/venues.json, hämtar menyerna via plattformarnas öppna JSON-API och sparar som importformuläret gör.
// Miljövariabler: WOLT_LAT/WOLT_LON (leveransadress för kampanjer), SCRAPE_CONCURRENCY, SCRAPE_DUE_HOUR.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadHistory,loadVenues,loadMember,saveSnapshots} from '../lib/store.mjs';
import {scrapeAll,isDue,unusualDeals} from '../lib/scrape.mjs';
import {money} from '../lib/prices.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v]=a.replace(/^--/,'').split('=');return [k,v??true];}));
const lat=Number(process.env.WOLT_LAT||59.3076),lon=Number(process.env.WOLT_LON||18.0764);
const output=async(k,v)=>{if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);};
const summary=async md=>{if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md+'\n');};

const history=await loadHistory(root);
if(args['if-due']&&!isDue(history,new Date().toISOString(),Number(process.env.SCRAPE_DUE_HOUR||16))){
 console.log('Ingen avläsning behövs just nu (redan gjord i dag eller för tidigt).');await output('saved',false);process.exit(0);}

let venues=await loadVenues(root);
if(args.only)venues=venues.filter(v=>(v.name+' '+(v.url||'')).toLocaleLowerCase('sv').includes(String(args.only).toLocaleLowerCase('sv')));
if(args.limit)venues=venues.slice(0,Number(args.limit));
if(!venues.length){console.error('Inga restauranger att läsa.');process.exit(1);}

console.log(`Läser ${venues.length} restauranger…`);
const member=await loadMember(root);
const {ok,failed}=await scrapeAll({venues,history,member,lat,lon,concurrency:Number(process.env.SCRAPE_CONCURRENCY||2),log:m=>console.log('  '+m)});

let saved=null;
if(ok.length&&!args['dry-run'])saved=await saveSnapshots(root,{snapshots:ok.map(r=>r.snapshot)});
const deals=saved?unusualDeals(saved.history,new Set(ok.map(r=>r.snapshot.url))):[];

const lines=[`### Prisavläsning ${new Date().toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}${args['dry-run']?' (provkörning, inget sparat)':''}`,
 `${ok.length} av ${venues.length} restauranger lästa, ${ok.reduce((n,r)=>n+r.snapshot.items.length,0)} rätter.`];
if(failed.length)lines.push('','**Misslyckades (gamla data behålls):**',...failed.map(f=>`- ${f.venue.name}: ${f.error}`));
const warned=ok.filter(r=>r.warnings.length);if(warned.length)lines.push('','**Varningar:**',...warned.map(r=>`- ${r.venue.name}: ${r.warnings.join(', ')}`));
if(deals.length)lines.push('','**Ovanligt billigt:**',...deals.map(d=>`- ${d.name} hos ${d.venue}: ${money(d.price)} (−${d.discount} % mot median ${money(d.median)})`));
console.log('\n'+lines.join('\n'));await summary(lines.join('\n'));
await output('saved',!!saved);await output('failed',failed.length);await output('deals',deals.length);
if(!ok.length){console.error('Ingen meny kunde läsas; inget sparat.');process.exit(1);}
