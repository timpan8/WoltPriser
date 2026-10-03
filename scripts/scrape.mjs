// Schemalagd prisinsamling: node scripts/scrape.mjs [--dry-run] [--if-due] [--only=text] [--limit=N] [--strict]
// Läser data/venues.json, hämtar Wolt-menyerna och Uber Eats-jämförelsepriserna via deras öppna webb-API och sparar.
// --strict: avsluta med fel om någon restaurang misslyckas (används i provkörningen på pull requests).
// Miljövariabler: WOLT_LAT/WOLT_LON (leveransadress för kampanjer), SCRAPE_CONCURRENCY, SCRAPE_DUE_HOUR.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadHistory,loadVenues,loadMember,saveSnapshots,loadCompare,saveCompare,loadUberEatsLinks,saveUberEatsLinks} from '../lib/store.mjs';
import {scrapeAll,scrapeUberEats,isDue,unusualDeals,scrapeList,DEFAULT_POS} from '../lib/scrape.mjs';
import {defaultSource} from '../lib/sources/index.mjs';
import {UBEREATS} from '../lib/foodora.mjs';
import {money} from '../lib/prices.mjs';
import {updateGoogle} from '../lib/sources/google.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v]=a.replace(/^--/,'').split('=');return [k,v??true];}));
// Standard: Årsta (postnummer 120 53, runt Årsta torg). WOLT_LAT/WOLT_LON går före.
const lat=Number(process.env.WOLT_LAT||DEFAULT_POS.lat),lon=Number(process.env.WOLT_LON||DEFAULT_POS.lon);
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

// Uber Eats för samma restauranger; saknade länkar söks upp (UBEREATS_SEARCH_LIMIT per körning, 0 stänger av sökningen).
const ue=process.env.SCRAPE_UBEREATS==='0'?{ok:[],failed:[],links:null,searched:0,found:0}:await scrapeUberEats({venues,store:await loadCompare(root,UBEREATS),links:await loadUberEatsLinks(root),lat,lon,searchLimit:Number(process.env.UBEREATS_SEARCH_LIMIT??80),log:m=>console.log('  '+m)});

let saved=null,ueSaved=false;
if(ok.length&&!args['dry-run']){saved=await saveSnapshots(root,{snapshots:ok.map(r=>r.snapshot)},{addVenues:false});
 if(discovered)await fs.writeFile(new URL('../data/discovered.json',import.meta.url),JSON.stringify({updated:new Date().toISOString(),venues:discovered},null,1)+'\n');
 // Betyg för alla lästa restauranger (även dina, som inte alltid finns i restauranglistan). Gamla betyg behålls.
 const rfile=new URL('../data/ratings.json',import.meta.url),ratings=JSON.parse(await fs.readFile(rfile,'utf8').catch(()=>'{}'));
 for(const r of ok)if(r.rating!=null)ratings[r.snapshot.url]=r.rating;for(const v of discovered||[])if(v.rating!=null)ratings[v.url]=v.rating;
 await fs.writeFile(rfile,JSON.stringify(ratings,null,1)+'\n');
 // Öppettider och minsta ordervärde per restaurang (data/venueinfo.json). Gamla uppgifter behålls om nya saknas.
 const ifile=new URL('../data/venueinfo.json',import.meta.url),vinfo=JSON.parse(await fs.readFile(ifile,'utf8').catch(()=>'{}'));
 for(const r of ok)if(r.hours||r.minOrder)vinfo[r.snapshot.url]={...vinfo[r.snapshot.url],...(r.hours?{hours:r.hours}:{}),...(r.minOrder?{minOrder:r.minOrder}:{})};
 await fs.writeFile(ifile,JSON.stringify(vinfo)+'\n');}
// Google-betyg (data/google.json) när GOOGLE_PLACES_KEY finns; i provkörningen bara ett par restauranger och inget sparas.
let google=null;
if(process.env.GOOGLE_PLACES_KEY&&ok.length){const gfile=new URL('../data/google.json',import.meta.url),store=args['dry-run']?{}:JSON.parse(await fs.readFile(gfile,'utf8').catch(()=>'{}'));
 google=await updateGoogle({venues:ok.map(r=>({url:r.snapshot.url,name:r.venue.name,address:r.place?.address,pos:r.place?.pos})),store,key:process.env.GOOGLE_PLACES_KEY,center:{lat,lon},limit:args['dry-run']?3:Number(process.env.GOOGLE_LIMIT||60)});
 if(!args['dry-run']&&google.fetched)await fs.writeFile(gfile,JSON.stringify(google.store,null,1)+'\n');}
if(ue.ok.length&&!args['dry-run']){await saveCompare(root,UBEREATS,ue.ok.map(r=>r.snapshot));ueSaved=true;}
if(ue.searched&&!args['dry-run']){await saveUberEatsLinks(root,ue.links);ueSaved=true;}
const deals=saved?unusualDeals(saved.history,new Set(ok.map(r=>r.snapshot.url))):[];

const lines=[`### Prisavläsning ${new Date().toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}${args['dry-run']?' (provkörning, inget sparat)':''}`,
 `${ok.length} av ${venues.length} restauranger lästa, ${ok.reduce((n,r)=>n+r.snapshot.items.length,0)} rätter, betyg för ${ok.filter(r=>r.rating!=null).length}, öppettider för ${ok.filter(r=>r.hours).length}, minsta order för ${ok.filter(r=>r.minOrder).length}.`];
// Diagnostik i provkörningen: hur svaret ser ut när öppettider inte hittas.
if(args['dry-run']){const d=ok.find(r=>r.debug?.length);if(d)lines.push('',`Tidsnycklar i Wolts svar (${d.venue.name}): `+d.debug.join(' · '));}
if(args['dry-run']){const hm=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;for(const r of ok.filter(r=>r.hours||r.minOrder).slice(0,3))lines.push(`- ${r.venue.name}: ${Object.entries(r.hours||{}).map(([d,rs])=>d+' '+rs.map(([a,b])=>hm(a)+'–'+hm(b)).join(', ')).join(' · ')}${r.minOrder?` · minsta order ${money(r.minOrder)}`:''}`);}
const gl=()=>Object.entries(google.store).filter(([u,g])=>g.rating!=null&&ok.some(r=>r.snapshot.url===u)).slice(0,3).map(([u,g])=>`${ok.find(r=>r.snapshot.url===u).venue.name} ★ ${g.rating} (${g.count})`).join(', ');
if(google)lines.push('',`Google-betyg: hämtade ${google.fetched} av ${google.due} som behövde uppdateras, hittade ${google.found}${google.found?' (t.ex. '+gl()+')':''}.${google.errors.length?' Fel: '+google.errors.slice(0,3).join('; '):''}`);
else if(!process.env.GOOGLE_PLACES_KEY)lines.push('','Google-betyg: ingen GOOGLE_PLACES_KEY, hoppar över.');
if(args['dry-run'])lines.push(`Adress/position från Wolt: ${ok.filter(r=>r.place?.pos).length} av ${ok.length} med position, ${ok.filter(r=>r.place?.address).length} med adress${ok[0]?.place?.address?` (t.ex. ${ok[0].place.address})`:''}.`);
const cap=(list,n=25)=>list.length>n?[...list.slice(0,n),`- … och ${list.length-n} till`]:list;
if(failed.length)lines.push('','**Misslyckades (gamla data behålls):**',...cap(failed.map(f=>`- ${f.venue.name}: ${f.error}`)));
if(ue.blocked)lines.push('',`**Uber Eats blockerar läsningen härifrån** (${ue.blocked}). ${ue.ok.length} restauranger hann läsas. Gamla Uber Eats-priser behålls; använd webbläsarreserven (AUTOMATION.md, Uber Eats i webbläsaren).`);
else if(ue.ok.length||ue.failed.length||ue.searched)lines.push('',`Uber Eats: ${ue.ok.length} av ${ue.ok.length+ue.failed.length} restauranger lästa, ${ue.ok.reduce((n,r)=>n+r.snapshot.items.length,0)} rätter. Sökte ${ue.searched} restauranger utan länk, hittade ${ue.found}.`,...cap(ue.failed.map(f=>`- ${f.venue.name}: ${f.error}`)));
const warned=ok.filter(r=>r.warnings.length);if(warned.length)lines.push('','**Varningar:**',...cap(warned.map(r=>`- ${r.venue.name}: ${r.warnings.join(', ')}`)));
if(deals.length)lines.push('','**Ovanligt billigt:**',...cap(deals.map(d=>`- ${d.name} hos ${d.venue}: ${money(d.price)} (−${d.discount} % mot median ${money(d.median)})`)));
console.log('\n'+lines.join('\n'));await summary(lines.join('\n'));
await output('saved',!!saved||ueSaved);await output('failed',failed.length+ue.failed.length);await output('deals',deals.length);
if(!ok.length){console.error('Ingen Wolt-meny kunde läsas; inget sparat.');process.exit(1);}
if(args.strict&&(failed.some(f=>!f.venue.discovered)||ue.failed.length)){console.error('Minst en restaurang misslyckades (--strict).');process.exit(1);}
