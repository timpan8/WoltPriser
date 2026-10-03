// Schemalagd prisinsamling: node scripts/scrape.mjs [--dry-run] [--if-due] [--only=text] [--limit=N] [--strict]
// Läser data/venues.json, hämtar Wolt-menyerna och Uber Eats-jämförelsepriserna via deras öppna webb-API och sparar.
// --strict: avsluta med fel om någon restaurang misslyckas (används i provkörningen på pull requests).
// Miljövariabler: WOLT_LAT/WOLT_LON (leveransadress för kampanjer), SCRAPE_CONCURRENCY, SCRAPE_DUE_HOUR.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadHistory,loadVenues,loadMember,saveSnapshots,loadCompare,saveCompare} from '../lib/store.mjs';
import {scrapeAll,scrapeUberEats,isDue,unusualDeals,scrapeList} from '../lib/scrape.mjs';
import {defaultSource} from '../lib/sources/index.mjs';
import {UBEREATS} from '../lib/foodora.mjs';
import {money} from '../lib/prices.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v]=a.replace(/^--/,'').split('=');return [k,v??true];}));
// Standard: Årsta (postnummer 120 53, runt Årsta torg). WOLT_LAT/WOLT_LON går före.
const lat=Number(process.env.WOLT_LAT||59.299),lon=Number(process.env.WOLT_LON||18.052);
const output=async(k,v)=>{if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);};
const summary=async md=>{if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md+'\n');};

const history=await loadHistory(root);
if(args['if-due']&&!isDue(history,new Date().toISOString(),Number(process.env.SCRAPE_DUE_HOUR||16))){
 console.log('Ingen avläsning behövs just nu (redan gjord i dag eller för tidigt).');await output('saved',false);process.exit(0);}

let venues=await loadVenues(root);
// Upptäckt: alla restauranger som levererar till positionen (av med SCRAPE_DISCOVER=0 eller vid --only).
// Misslyckas den läses bara dina restauranger, och förra listan i data/discovered.json behålls.
let discovered=null;
if(process.env.SCRAPE_DISCOVER!=='0'&&!args.only){
 try{discovered=await defaultSource.discover({lat,lon});console.log(`Hittade ${discovered.length} restauranger som levererar till positionen, t.ex. ${discovered.slice(0,3).map(v=>`${v.name} (${[v.rating!=null?'★ '+v.rating:'',...v.tags].filter(Boolean).join(', ')||'utan betyg/kök'})`).join('; ')}.`);}
 catch(e){console.log(`Kunde inte hämta restauranglistan (${e.message}); läser bara dina restauranger.`);}
 venues=scrapeList(venues,discovered||[]);
}
if(args.only)venues=venues.filter(v=>(v.name+' '+(v.url||'')).toLocaleLowerCase('sv').includes(String(args.only).toLocaleLowerCase('sv')));
// --limit=N läser de N första av dina; --discovered=M lägger till M upptäckta (för provkörningar).
if(args.limit){const own=venues.filter(v=>!v.discovered).slice(0,Number(args.limit)),extra=args.discovered?venues.filter(v=>v.discovered).slice(0,Number(args.discovered)):[];venues=[...own,...extra];}
if(!venues.length){console.error('Inga restauranger att läsa.');process.exit(1);}

console.log(`Läser ${venues.length} restauranger…`);
const member=await loadMember(root);
const {ok,failed}=await scrapeAll({venues,history,member,lat,lon,concurrency:Number(process.env.SCRAPE_CONCURRENCY||2),log:m=>console.log('  '+m)});

const ue=await scrapeUberEats({venues,store:await loadCompare(root,UBEREATS),log:m=>console.log('  '+m)});

let saved=null,ueSaved=false;
if(ok.length&&!args['dry-run']){saved=await saveSnapshots(root,{snapshots:ok.map(r=>r.snapshot)},{addVenues:false});
 if(discovered)await fs.writeFile(new URL('../data/discovered.json',import.meta.url),JSON.stringify({updated:new Date().toISOString(),venues:discovered},null,1)+'\n');}
if(ue.ok.length&&!args['dry-run']){await saveCompare(root,UBEREATS,ue.ok.map(r=>r.snapshot));ueSaved=true;}
const deals=saved?unusualDeals(saved.history,new Set(ok.map(r=>r.snapshot.url))):[];

const lines=[`### Prisavläsning ${new Date().toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}${args['dry-run']?' (provkörning, inget sparat)':''}`,
 `${ok.length} av ${venues.length} restauranger lästa, ${ok.reduce((n,r)=>n+r.snapshot.items.length,0)} rätter.`];
const cap=(list,n=25)=>list.length>n?[...list.slice(0,n),`- … och ${list.length-n} till`]:list;
if(failed.length)lines.push('','**Misslyckades (gamla data behålls):**',...cap(failed.map(f=>`- ${f.venue.name}: ${f.error}`)));
if(ue.ok.length||ue.failed.length)lines.push('',`Uber Eats: ${ue.ok.length} av ${ue.ok.length+ue.failed.length} restauranger lästa, ${ue.ok.reduce((n,r)=>n+r.snapshot.items.length,0)} rätter.`,...cap(ue.failed.map(f=>`- ${f.venue.name}: ${f.error}`)));
const warned=ok.filter(r=>r.warnings.length);if(warned.length)lines.push('','**Varningar:**',...cap(warned.map(r=>`- ${r.venue.name}: ${r.warnings.join(', ')}`)));
if(deals.length)lines.push('','**Ovanligt billigt:**',...cap(deals.map(d=>`- ${d.name} hos ${d.venue}: ${money(d.price)} (−${d.discount} % mot median ${money(d.median)})`)));
console.log('\n'+lines.join('\n'));await summary(lines.join('\n'));
await output('saved',!!saved||ueSaved);await output('failed',failed.length+ue.failed.length);await output('deals',deals.length);
if(!ok.length){console.error('Ingen Wolt-meny kunde läsas; inget sparat.');process.exit(1);}
if(args.strict&&(failed.some(f=>!f.venue.discovered)||ue.failed.length)){console.error('Minst en restaurang misslyckades (--strict).');process.exit(1);}
