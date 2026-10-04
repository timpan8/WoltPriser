import {money,seafood,effectivePrice,analyze,normalizeHistory,latestSnapshots,COURSES,course,deal,imageFor,volumeMl,diet} from './lib/prices.mjs';
import {receiptPoints,purchases} from './lib/receipts.mjs';
import {tokens,dishIndex,dishGroups,matchKind} from './lib/dishes.mjs';
import {feeModel,withFees} from './lib/fees.mjs';
import {fillUp,minGap} from './lib/fillup.mjs';
import {SUBCATS,subcatsFor} from './lib/subcats.mjs';
import {foodoraMenu,matchFoodora,foodoraPrice,foodoraPoints,otherVenues,venueKey,logTimeline,FOODORA,UBEREATS} from './lib/foodora.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let history=[],latest=[],rows=[],receipts=null,images=null,fees=null,rowCache={},ratings=null,vinfo=null,google=null,stock=new Set(),mineUrls=new Set(),meta=new Map(),foodora=null,ubereats=null,groups=[],dishes=[],limit=24,also=new Map(),lastQ='',sub='';const fmt=s=>new Date(s).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const TABS=[['mina','Mina rätter'],['bev','★ Bevakade'],...COURSES],tab=()=>{const h=location.hash.slice(1).split('?')[0];return TABS.some(([k])=>k===h)?h:groups.length?'mina':'mat';};
// Bevakade rätter och beställningen sparas i webbläsaren (bara på den här enheten).
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}},store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const favKey=r=>r.s.url+'|'+r.item.name.toLocaleLowerCase('sv').replace(/\s+/g,' ').trim(),favs=new Set(load('woltpriser-favs',[]));
let cart=load('woltpriser-cart',[]),rowByKey=new Map();const cartKey=r=>r.s.url+'|'+r.item.id;
const dupKey=r=>[r.item.name.toLocaleLowerCase('sv').replace(/[®™]/g,'').replace(/\s+/g,' ').trim(),r.price,r.item.originalPrice,r.deal.level].join('|');
const COURSE_ICON={mat:'🍽️',frukost:'🥪',fika:'🍰',dryck:'🥤',smatt:'🍟',barn:'🧒'};
// Betyg: restauranglistan (discovered.json) eller avläsningen (ratings.json, även dina restauranger).
const ratingOf=url=>meta.get(url)?.rating??ratings?.[url]??null;
// Betygsnivå på samma skala oavsett app (Googles 1–5 räknas gånger 2): 9+ utmärkt, 8+ bra, 7+ okej, annars svagt.
// Färgen visar nivån, så att Google 4,6 och Wolt 9,2 båda syns som utmärkta trots olika skalor.
const LEVELS=['','svagt','okej','bra','utmärkt'],level=x=>x>=9?4:x>=8?3:x>=7?2:1,num=v=>String(Math.round(v*10)/10).replace('.',',');
const stars=url=>{const v=ratingOf(url);if(!v)return '';const l=level(v);return ` <span class="rating rt r${l}" title="Wolt-betyg ${num(v)} av 10 (${LEVELS[l]})">Wolt ${num(v)}<small>/10</small></span>`;};
// Google-betyget (1–5) med antal omdömen och länk till Google Maps, om det finns i data/google.json.
const rates=url=>{const w=stars(url),g=gstars(url);return w||g?`<div class="opt-rates">${w}${g}</div>`:'';};
// Betyg på tioskala för sortering: Wolt (0–10), Google (1–5, gånger 2) och snittet av de som finns.
const woltR=url=>ratingOf(url)??null,googR=url=>google?.[url]?.rating!=null?google[url].rating*2:null,avgR=url=>{const v=[woltR(url),googR(url)].filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b)/v.length:null;};
const gstars=(url,short)=>{const g=google?.[url];if(g?.rating==null)return '';const l=level(g.rating*2),n=(g.count||0).toLocaleString('sv-SE');
 return ` <a class="grating rt r${l}" href="${esc(g.maps||'https://www.google.com/maps/search/?api=1&query=Google&query_place_id='+g.id)}" target="_blank" rel="noopener noreferrer" title="Google-betyg ${num(g.rating)} av 5 (${LEVELS[l]}), ${n} omdömen">Google ${num(g.rating)}<small>/5</small>${short?'':` <small class="cnt">(${n})</small>`}</a>`;};
// Öppettider (data/venueinfo.json, minuter efter midnatt, svensk tid). null om okänt.
const DAYS=['sun','mon','tue','wed','thu','fri','sat'],DAYNAME={mon:'mån',tue:'tis',wed:'ons',thu:'tors',fri:'fre',sat:'lör',sun:'sön'};
const hm=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
// Öppet/stängt per restaurang, beräknat högst en gång per minut (anropas för varje rad vid sortering).
const openMemo=new Map(),TZPARTS=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Stockholm',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function openState(url,now=new Date()){const m=Math.floor(now/6e4),c=openMemo.get(url);if(c&&c.m===m)return c.s;const s=openStateAt(url,now);openMemo.set(url,{m,s});return s;}
function openStateAt(url,now){const h=vinfo?.[url]?.hours;if(!h||!Object.values(h).some(r=>r?.length))return null;
 const p=Object.fromEntries(TZPARTS.formatToParts(now).map(x=>[x.type,x.value]));
 const d=DAYS.indexOf(p.weekday.slice(0,3).toLowerCase()),t=Number(p.hour)*60+Number(p.minute),day=k=>h[DAYS[(d+k+7)%7]]||[];
 for(const [o,c] of day(0))if(t>=o&&t<c)return {open:true,close:c,left:c-t};
 for(const [o,c] of day(-1))if(c>1440&&t<c-1440)return {open:true,close:c-1440,left:c-1440-t};
 for(let k=0;k<7;k++){const next=day(k).map(r=>r[0]).filter(o=>k>0||o>t).sort((a,b)=>a-b)[0];if(next!=null)return {open:false,opens:next,day:k?DAYS[(d+k)%7]:null};}
 return {open:false};}
// Stängd restaurang just nu: kortet tonas rött (klassen closed), så att den syns direkt i listan.
const closedCls=url=>openState(url)?.open===false?' closed':'';
const hoursTag=url=>{const s=openState(url);if(!s)return '';
 if(s.open)return s.left<=60?`<span class="hours soon">Stänger ${hm(s.close)} (om ${s.left} min)</span>`:`<span class="hours">Öppet till ${hm(s.close)}</span>`;
 return `<span class="hours closed">Stängt${s.opens!=null?` · öppnar ${s.day?DAYNAME[s.day]+' ':''}${hm(s.opens)}`:''}</span>`;};
const venueLink=s=>`<button type="button" class="vlink" data-url="${esc(s.url)}" title="Visa alla rätter hos ${esc(s.name)}">${esc(s.name)}</button>`;
const belowUsual=r=>r.bought&&r.price<r.bought.usual?r.bought.usual-r.price:0;
const under=(d,r)=>d.g.members.get(r.item)==='variant'?0:Math.max(0,d.g.usual-r.price),dishOffer=d=>d.best&&(d.best.deal.level||under(d,d.best));
const totalLine=r=>{const f=r.fees;return f?`<div class="total" title="Serviceavgift och leverans efter Wolt+-rabatt, ${Math.round(f.ratio*1000)/10} % av ordinarie pris ${f.orders?`enligt dina ${f.orders} beställningar hos restaurangen`:'enligt dina senaste beställningar'}. Tillägg för liten beställning ingår inte.">≈ ${money(f.total)} med avgifter <span>(+${money(f.fee)})</span></div>`:'';};
const thumb=u=>`<div class="thumb${stock.has(u)?' stock':''}"${stock.has(u)?' title="Exempelbild från Wolt, inte restaurangens eget foto"':''}>${u?`<img src="${esc(u)}?w=300" srcset="${esc(u)}?w=300 300w, ${esc(u)}?w=600 600w" sizes="(max-width:540px) 92vw, (max-width:800px) 46vw, 380px" loading="lazy" decoding="async" alt="" onerror="this.remove()">`:''}</div>`;
function dishCard(d,i){const g=d.g,b=d.best,bought=`<div class="bought"><span>Köpt ${g.times} gånger</span> · du brukar betala ${money(g.usual)}</div>`;
 if(!b)return `<article class="card dish off"><h3>${esc(g.title)}</h3>${bought}<p class="description">Finns inte på någon bevakad meny just nu. Rätter från nya restauranger dyker upp efter nästa insamling.</p></article>`;
 const below=under(d,b),sale=b.price<b.item.originalPrice,venues=new Set(d.m.map(r=>r.s.url)).size;
 const tag=b.deal.level?`<span class="tag t${b.deal.level}">${esc(b.deal.label)}</span>`:below>0?'<span class="tag t1">Under ditt vanliga pris</span>':'',save=below>0?`<span class="save">${money(below)} under ditt vanliga</span>`:b.deal.save>0?`<span class="save">Spara ${money(b.deal.save)}</span>`:'';
 return `<article class="card dish${b.deal.level?' lvl'+b.deal.level:''}${closedCls(b.s.url)}">${thumb(imageFor(images,b.s.url,b.item.id))}<div class="card-top">${tag}${save}</div><h3>${esc(g.title)}</h3>${bought}<div class="best">Billigast just nu</div><div class="price-row"><span class="price">${money(b.price)}</span>${sale?`<del>${money(b.item.originalPrice)}</del>`:''}</div>${totalLine(b)}<div class="venue">${esc(b.s.name)}${b.s.other?` <span class="via">${esc(b.s.label)}</span>`:''}${stars(b.s.url)}${gstars(b.s.url,1)}${hoursTag(b.s.url)}<span> · ${esc(b.item.name)}${g.members.get(b.item)==='variant'?' (annan variant)':''}</span></div>${b.item.woltPlus&&$('#plus').checked?'<div class="membership">Priset kräver Wolt+</div>':''}<div class="card-bottom"><button class="compare" data-dish="${i}">${d.m.length>1?`Jämför ${d.m.length} alternativ hos ${venues} ${venues===1?'restaurang':'restauranger'} →`:'Visa detaljer →'}</button><a class="order" href="${esc(b.s.url)}" target="_blank" rel="noopener noreferrer">${esc(b.s.label||'Wolt')} ↗</a></div></article>`;}
function showDish(d){$('#dishTitle').textContent=d.g.title;$('#dishSub').textContent=`Köpt ${d.g.times} gånger hos ${d.g.venues.join(', ')} · du brukar betala ${money(d.g.usual)}`;
 $('#dishList').innerHTML=d.m.map(r=>{const idx=rows.indexOf(r),sale=r.price<r.item.originalPrice,below=under(d,r),kind=d.g.members.get(r.item);const img=imageFor(images,r.s.url,r.item.id);return `<li class="opt${r===d.best?' first':''}${closedCls(r.s.url)}"><div class="opt-img${stock.has(img)?' stock':''}"${stock.has(img)?' title="Exempelbild från Wolt, inte restaurangens eget foto"':''}>${img?`<img src="${esc(img)}?w=160" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''}</div><div class="opt-main"><b>${esc(r.s.name)}${r.s.other?` <small class="via">${esc(r.s.label)}</small>`:''}</b>${rates(r.s.url)}${hoursTag(r.s.url)}<span>${esc(r.item.name)}${kind==='variant'?' · annan variant eller storlek':kind==='similar'?' · liknande rätt':''}</span><div>${r.deal.level?`<span class="tag t${r.deal.level}">${esc(r.deal.label)}</span> `:''}${below>0?`<small class="under">${money(below)} under ditt vanliga</small>`:''}${r.item.woltPlus&&$('#plus').checked?'<small> Kräver Wolt+</small>':''}</div></div><div class="opt-price"><span>${money(r.price)}</span>${sale?`<del>${money(r.item.originalPrice)}</del>`:''}${r.fees?`<small>≈ ${money(r.fees.total)} med avgifter</small>`:''}</div><div class="opt-links"><button class="history-button" data-index="${idx}">Prishistorik</button><a class="order" href="${esc(r.s.url)}" target="_blank" rel="noopener noreferrer">${esc(r.s.label||'Wolt')} ↗</a></div></li>`;}).join('');
 $('#dishList').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>{$('#dishDialog').close();showHistory(rows[Number(b.dataset.index)]);}));$('#dishDialog').showModal();}
// Samma rätt på Foodora och Uber Eats (menypris, utan avgifter). Jämförs med priset som visas på kortet
// (Wolt, eller huvudappen för restauranger som inte finns på Wolt).
// Jämförelsepriser från Foodora/Uber Eats får ett datum när de är äldre än ett dygn (Uber Eats läses i webbläsaren och kan bli
// gammalt) och används inte alls när de är äldre än en vecka.
const STALE_DAYS=7,stale=at=>!at||Date.now()-Date.parse(at)>STALE_DAYS*864e5,ageNote=at=>at&&Date.now()-Date.parse(at)>36*36e5?` <span class="age" title="Priset lästes ${new Date(at).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}">(pris från ${new Date(at).toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm',day:'numeric',month:'short'})})</span>`:'';
const otherLine=(r,f,fp,label,cls,note)=>{if(!f)return '';const diff=r.price-fp,dir=diff>0?' cheaper':diff<0?' dearer':'';
 return `<div class="fd-line ${cls}${dir}"><a href="${esc(f.venue)}" target="_blank" rel="noopener noreferrer">${label}</a> ${f.from?'från ':''}${money(fp)}${diff>0?` · <b>${money(diff)} billigare</b>`:diff<0?` · ${esc(r.s.label||'Wolt')} ${money(-diff)} billigare`:' · samma pris'}${note}${f.similar?` <span>(”${esc(f.name)}”)</span>`:''}${ageNote(f.at)}</div>`;};
const fdLine=r=>otherLine(r,r.item.fd,r.fdp,'Foodora','fd',$('#fdPro').checked&&r.item.fd?.proPrice!==null?' <span>(pro)</span>':'')+otherLine(r,r.item.ue,r.uep,'Uber Eats','ue','');
// Vid sorteringen Närmast minsta order: restaurangens minsta ordervärde och hur nära rätten ensam hamnar.
const minOf=r=>r.s.other?null:vinfo?.[r.s.url]?.minOrder||null;
const minLine=r=>{if($('#sort').value!=='minorder')return '';const m=minOf(r);if(!m)return '<div class="minline">Minsta ordervärde okänt</div>';const d=r.price-m;
 return `<div class="minline">Minsta order ${money(m)} · ${d===0?'<b class="over">precis</b>':d>0?`<b class="over">${money(d)} över</b>`:`<b class="under">${money(-d)} kvar</b>`}</div>`;};
function card(r){const idx=rows.indexOf(r),sale=r.price<r.item.originalPrice,st=r.stats,d=r.deal;
 const change=st.change?`${st.change<0?'↓':'↑'} ${money(Math.abs(st.change))} sedan förra avläsningen`:'';
 const tag=d.level?`<span class="tag t${d.level}">${esc(d.label)}</span>`:'',save=d.save>0?`<span class="save">Spara ${money(d.save)}</span>`:'';
 const usual=st.median&&d.level===3?`<div class="usual">Brukar kosta ${money(st.median)}</div>`:'',b=r.bought,mine=belowUsual(r);
 const bought=b?`<div class="bought"><span>Köpt ${b.times} ${b.times===1?'gång':'gånger'}</span> · ${b.times===1?'du betalade':'du brukar betala'} ${money(b.usual)}${mine?` <b>· ${money(mine)} billigare nu</b>`:''}</div>`:'';
 return `<article class="card${d.level?' lvl'+d.level:''}${closedCls(r.s.url)}">${thumb(imageFor(images,r.s.url,r.item.id))}<div class="card-top">${tag}${save}<button type="button" class="fav${favs.has(favKey(r))?' on':''}" data-fav="${idx}" aria-pressed="${favs.has(favKey(r))}" title="${favs.has(favKey(r))?'Sluta bevaka':'Bevaka rätten'}">${favs.has(favKey(r))?'★':'☆'}</button></div><h3>${esc(r.item.name)}</h3><div class="venue">${venueLink(r.s)}${r.s.other?` <span class="via" title="Restaurangen finns inte på Wolt">Inte på Wolt</span>`:''}${stars(r.s.url)}${gstars(r.s.url,1)}<span> · ${esc(r.item.category||'Meny')}</span>${ageNote(r.s.observedAt)}${hoursTag(r.s.url)}</div>${minLine(r)}${(o=>o?.length?`<details class="also"><summary>Samma pris hos ${o.length} ${o.length===1?'restaurang':'restauranger'} till</summary><p>${[...new Set(o.map(x=>x.s.name))].map(esc).join(' · ')}</p></details>`:'')(also.get(r))}<p class="description">${esc(r.item.description)}</p><div class="price-row">${r.item.from?'<small class="from">från</small>':''}<span class="price">${money(r.price)}</span>${sale?`<del>${money(r.item.originalPrice)}</del>`:''}${r.item.ml?`<span class="perl">${money(Math.round(cmp(r)/r.item.ml*1000))}/l</span>`:''}</div>${totalLine(r)}${fdLine(r)}${usual}${bought}${r.item.woltPlus&&$('#plus').checked?'<div class="membership">Priset kräver Wolt+</div>':''}${change?`<div class="change${st.change<0?' down':''}">${esc(change)}</div>`:''}<div class="card-bottom"><button class="history-button" data-index="${idx}">↗ Historik</button><button type="button" class="add" data-add="${idx}" title="Lägg i beställningen">+ Lägg till</button><a class="order" href="${esc(r.s.url)}" target="_blank" rel="noopener noreferrer">${esc(r.s.label||'Wolt')} ↗</a></div></article>`;}
// Filtren i webbadressen (#mat?q=pizza&max=150&sub=pizza), så att en vy kan sparas som bokmärke eller delas.
const URLKEYS={q:'search',r:'restaurant',k:'cuisine',max:'budget',sort:'sort',size:'size',apps:'apps',rating:'minRating',grating:'minGoogle',diet:'diet',mine:'onlyMine',fees:'withFees',deals:'onlyDeals',plus:'plus',open:'openNow',pro:'fdPro',fd:'fdCheaper',ue:'ueCheaper'};
function filtersFromUrl(){const p=new URLSearchParams(location.hash.split('?')[1]||'');if(![...p.keys()].length)return null;const f={};
 for(const [u,k] of Object.entries(URLKEYS))if(p.has(u)){const v=p.get(u),d=DEFAULTS[k];f[k]=typeof d==='boolean'?v==='1':typeof d==='number'?Number(v)||d:v;}
 return {f,sub:p.get('sub')||''};}
function writeUrl(current){const f=readFilters(),p=new URLSearchParams();
 for(const [u,k] of Object.entries(URLKEYS))if(f[k]!==DEFAULTS[k]&&f[k]!==''&&f[k]!=null)p.set(u,typeof f[k]==='boolean'?(f[k]?'1':'0'):String(f[k]));
 if(sub)p.set('sub',sub);const h='#'+current+(p.size?'?'+p:'');if(location.hash!==h)window.history.replaceState(null,'',h);}
function render(){
 const plus=$('#plus').checked,q=$('#search').value.trim().toLocaleLowerCase('sv'),restaurant=$('#restaurant').value,budget=maxPrice();let current=tab();
 // Raderna beror bara på Wolt+- och foodora pro-valet; de byggs en gång per kombination och återanvänds vid filtrering.
 const rowKey=plus+'|'+$('#fdPro').checked;if(rowCache.key!==rowKey){rowCache.key=rowKey;
 // Restauranger vars senaste avläsning är äldre än en vecka visas inte (de har slutat läsas); äldre än ett dygn får ett datum.
 rows=latest.filter(s=>!stale(s.observedAt)).flatMap(s=>s.items.filter(i=>i.available).map(item=>{const price=s.platform==='foodora'&&$('#fdPro').checked&&item.proPrice!==null?item.proPrice:effectivePrice(item,plus),stats=item.stats[plus]??=analyze(item.timeline,item,plus,s.observedAt);return {s,item,price,stats,course:item.course,bought:item.bought,deal:deal(item,price,stats),fees:s.other?null:withFees(fees,s.name,price,item.originalPrice),fdp:foodoraPrice(item.fd,$('#fdPro').checked),uep:foodoraPrice(item.ue,false)};}));
 const seen=new Set();rows=rows.sort((a,b)=>a.item.id.localeCompare(b.item.id)).filter(r=>{const key=JSON.stringify([r.s.url,r.item.name,r.item.description,r.price,r.item.originalPrice,r.item.woltPlus]);if(seen.has(key))return false;seen.add(key);return true;});
 rowCache.rows=rows;}else rows=rowCache.rows;
 rowByKey=new Map(rows.map(r=>[cartKey(r),r]));renderCart();
 const cuisine=$('#cuisine').value,onlyMine=$('#onlyMine').checked,apps=$('#appsBox').hidden?'wolt':$('#apps').value,appOk=r=>apps==='all'||(apps==='other'?r.s.other:!r.s.other)||r.s.url===restaurant;
 // Betyg (restauranger utan betyg räknas inte med när ett lägsta betyg är valt) och kost (gäller inte drycker).
 // Billigare i annan app: valda appar räknas som "någon av": Foodora och Uber Eats tillsammans visar rätter som är billigare i minst en av dem.
 const cheaperIn=[['#fdCheaper','fdp'],['#ueCheaper','uep']].filter(([id])=>$(id).checked&&!$(id).parentElement.hidden),cheaperOk=r=>!cheaperIn.length||cheaperIn.some(([,k])=>r[k]!==null&&r[k]<r.price);
 const minRating=Number($('#minRating').value)||0,minGoogle=$('#googleBox').hidden?0:Number($('#minGoogle').value)||0,dietSel=$('#diet').value,rateOk=r=>(!minRating||(ratingOf(r.s.url)??0)>=minRating)&&(!minGoogle||(google?.[r.s.url]?.rating??0)>=minGoogle)&&(!$('#openNow').checked||$('#openNow').parentElement.hidden||openState(r.s.url)?.open!==false),dietOk=r=>!['veg','vegan'].includes(dietSel)||r.course==='dryck'||(dietSel==='vegan'?r.item.diet==='vegan':!!r.item.diet);
 const offer=r=>r.deal.level||belowUsual(r),common=r=>(!restaurant||r.s.url===restaurant)&&appOk(r)&&rateOk(r)&&dietOk(r)&&(!onlyMine||mineUrls.has(r.s.url))&&(!cuisine||meta.get(r.s.url)?.tags?.includes(cuisine))&&(!q||r.item.text.includes(q))&&(!$('#onlyDeals').checked||offer(r))&&cheaperOk(r);
 const noFish=$('#diet').value==='nofish',pre=rows.filter(r=>common(r)&&(!noFish||!r.item.fish)),base=pre.filter(r=>cmp(r)<=budget),inTab=k=>k==='mina'?dishes:k==='bev'?base.filter(r=>favs.has(favKey(r))):base.filter(r=>r.course===k);
 dishes=groups.map(g=>{const m=rows.filter(r=>g.members.has(r.item)&&(!restaurant||r.s.url===restaurant)&&appOk(r)&&rateOk(r)).sort((a,b)=>(a.fees?.total??a.price)-(b.fees?.total??b.price)||a.price-b.price);return {g,m,best:m[0]};}).filter(d=>(!q||(d.g.title+' '+d.m.map(r=>r.item.name+' '+r.s.name).join(' ')).toLocaleLowerCase('sv').includes(q))&&(!$('#onlyDeals').checked||dishOffer(d))&&(!restaurant||d.best));
 const uniq=l=>new Set(l.map(dupKey)).size,label=k=>TABS.find(t=>t[0]===k)[1];
 // Sökning gäller alla flikar: har en annan flik minst fem gånger så många träffar i rättens eller restaurangens namn när sökordet ändras, visas den fliken.
 const nameHit=r=>(r.item.name+' '+r.s.name).toLocaleLowerCase('sv').includes(q);
 let moved=null;
 if(q&&q!==lastQ&&current!=='mina'){const named=k=>uniq(inTab(k).filter(nameHit)),cur=named(current),best=COURSES.map(([k])=>[k,named(k)]).sort((a,b)=>b[1]-a[1])[0];if(best[1]&&best[0]!==current&&best[1]>=Math.max(1,cur*5)){moved=current;current=best[0];window.history.replaceState(null,'','#'+current);}}
 lastQ=q;
 const others=q?TABS.filter(([k])=>k!==current&&(k!=='bev'||favs.size)).map(([k,l])=>[k,l,k==='mina'?dishes.length:uniq(inTab(k))]).filter(x=>x[2]):[];
 $('#searchNote').innerHTML=q?(moved?`Flest träffar under ${esc(label(current))}. `:'')+(others.length?`Träffar även i ${others.map(([k,l,n])=>`<a href="#${k}">${esc(l)} (${n})</a>`).join(' · ')}`:''):'';
 $('#searchNote').hidden=!$('#searchNote').innerHTML;
 if(current==='bev'&&!favs.size)current=groups.length?'mina':'mat';
 $('#tabs').innerHTML=TABS.filter(([k])=>k!=='bev'||favs.size).map(([k,label])=>{const all=inTab(k),list=k==='mina'?all:{length:uniq(all)},deals=k==='mina'?all.filter(dishOffer).length:uniq(all.filter(r=>r.deal.level));return `<a href="#${k}" class="tab${k===current?' active':''}${k==='mina'?' mine':''}"${k===current?' aria-current="page"':''}><span>${label}</span><small>${deals?`<b>${deals} ${deals===1?'erbjudande':'erbjudanden'}</b>`:`${list.length} rätter`}</small></a>`;}).join('');
 {const t=$('#tabs'),a=t.querySelector('.active');if(a&&(a.offsetLeft<t.scrollLeft||a.offsetLeft+a.offsetWidth>t.scrollLeft+t.clientWidth))t.scrollLeft=a.offsetLeft-16;}
 // Restaurangvy: vald restaurang visas med betyg, öppettider och minsta order överst.
 {const s=restaurant&&latest.find(x=>x.url===restaurant),i=s&&vinfo?.[s.url];$('#venueBanner').hidden=!s;
  if(s)$('#venueBanner').innerHTML=`<div><b>${esc(s.name)}</b>${stars(s.url)}${gstars(s.url)}${hoursTag(s.url)}${i?.minOrder?`<span class="minorder">Minsta order ${money(i.minOrder)}</span>`:''}</div><div><a class="order" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Öppna på ${esc(s.label||'Wolt')} ↗</a><button type="button" id="clearVenue">Alla restauranger ×</button></div>`;}
 const isDrink=current==='dryck',size=$('input[name=size]:checked')?.value||'all';$('#drinkRow').hidden=!isDrink;$('#literSort').hidden=$('#literSort').disabled=!isDrink;
 let mode=$('#sort').value;if(mode==='liter'&&!isDrink)mode='deals';const isMine=current==='mina';$('#mineNote').hidden=!isMine;$('#pricebox').classList.toggle('off',isMine);
 syncFilters(pre.filter(r=>r.course===current),budget);writeUrl(current);
 if(isMine){
  // Snabbfilter efter sort (mat, fika, dryck …) när favoriterna finns i minst två flikar.
  const kinds=COURSES.map(([k,l])=>({key:k,label:l,icon:COURSE_ICON[k],n:dishes.filter(d=>d.g.course===k).length})).filter(c=>c.n);
  if(sub&&!kinds.some(c=>c.key===sub))sub='';
  $('#subcats').hidden=kinds.length<2;$('#subcats').innerHTML=kinds.map(c=>`<button type="button" class="sub${c.key===sub?' active':''}" data-sub="${c.key}" aria-pressed="${c.key===sub}"><span aria-hidden="true">${c.icon}</span>${esc(c.label)}<small>${c.n}</small></button>`).join('');
  const ds=dishes.filter(d=>!sub||d.g.course===sub).sort((a,b)=>Number(!!b.best)-Number(!!a.best)||Number(!!dishOffer(b))-Number(!!dishOffer(a))||(b.best?.deal.level??0)-(a.best?.deal.level??0)||(b.best?under(b,b.best):0)-(a.best?under(a,a.best):0)||b.g.times-a.g.times);
  const n=ds.filter(dishOffer).length,sec=(t,l,note)=>l.length?`<h2 class="group">${t} <span>${note}</span></h2><div class="grid">${l.map(d=>dishCard(d,ds.indexOf(d))).join('')}</div>`:'';
  $('#cards').innerHTML=(sec('Bästa erbjudandena just nu',ds.slice(0,n),n+' st')+sec(n?'Dina övriga favoriter':'Dina favoriter',ds.slice(n),(ds.length-n)+' st'))||'<div class="empty">Inga av dina favoriträtter matchar filtren.</div>';
  $('#more').hidden=true;$('#cards').querySelectorAll('[data-dish]').forEach(b=>b.addEventListener('click',()=>showDish(ds[Number(b.dataset.dish)])));return;}
 const inSize=r=>size==='all'||r.item.ml&&(size==='small'?r.item.ml<500:size==='mid'?r.item.ml>=500&&r.item.ml<1000:r.item.ml>=1000);
 const inView=inTab(current).filter(r=>!isDrink||inSize(r));
 // Snabbfilter (underkategorier) med minst 3 rätter i fliken, i fast ordning; det valda visas alltid så att det går att välja bort.
 const subs=(SUBCATS[current]||[]).map(c=>({...c,n:uniq(inView.filter(r=>r.item.subs.includes(c.key)))})).filter(c=>c.n>=3||c.key===sub);
 if(sub&&!subs.some(c=>c.key===sub))sub='';
 $('#subcats').hidden=!subs.length;$('#subcats').innerHTML=subs.map(c=>`<button type="button" class="sub${c.key===sub?' active':''}" data-sub="${c.key}" aria-pressed="${c.key===sub}"><span aria-hidden="true">${c.icon}</span>${esc(c.label)}<small>${c.n}</small></button>`).join('');
 const sorted=sub?inView.filter(r=>r.item.subs.includes(sub)):inView;
 // Vid lika: dina restauranger först, sedan högst betyg (avgör vilken restaurang som visas när dubbletter slås ihop).
 const tie=(a,b)=>Number(mineUrls.has(b.s.url))-Number(mineUrls.has(a.s.url))||(ratingOf(b.s.url)??0)-(ratingOf(a.s.url)??0);
 const byDeal=(a,b)=>b.deal.level-a.deal.level||b.deal.save-a.deal.save||b.deal.pct-a.deal.pct||a.price-b.price||tie(a,b),perL=r=>r.item.ml?cmp(r)/r.item.ml:Infinity;
 // Betygssortering: högst först, restauranger utan betyg sist. Mest för pengarna: betyget (tioskala) minus 2 poäng per
 // fördubbling av priset jämfört med medianen för liknande rätter (samma snabbfilter, annars samma flik), så att en
 // pizza jämförs med pizzor och inte med en läsk. Kostar rätten ordinarie under halva medianen är den troligen en mindre
 // portion (en sushibit, en liten burgare) och får ingen prisbonus; kampanjpris på en vanlig rätt räknas fullt (ner till halva
 // medianen). Rätter under 15 kr och rätter utan betyg hamnar sist.
 const byR=f=>(a,b)=>(f(b.s.url)??-1)-(f(a.s.url)??-1)||cmp(a)-cmp(b)||tie(a,b);let value=null;
 if(mode==='value'){const pool=COURSES.some(([k])=>k===current)?pre.filter(r=>r.course===current):sorted,groups=new Map(),med=a=>{a.sort((x,y)=>x-y);return a[a.length>>1];};
  for(const r of pool)for(const k of [r.item.subs[0]||'',r.course]){if(!groups.has(k))groups.set(k,[]);groups.get(k).push(cmp(r));}
  const meds=new Map([...groups].map(([k,g])=>[k,{n:g.length,m:med(g)}])),ref=r=>{const g=r.item.subs[0]&&meds.get(r.item.subs[0]);return g&&g.n>=5?g.m:meds.get(r.course)?.m??cmp(r);},cache=new Map();
  value=r=>{if(!cache.has(r)){const q=avgR(r.s.url);const m=Math.max(ref(r),1),small=r.item.originalPrice/m<0.5;cache.set(r,q==null||cmp(r)<1500?-Infinity:q-(small?0:2*Math.log2(Math.min(3,Math.max(0.5,cmp(r)/m)))));}return cache.get(r);};}
 sorted.sort(mode==='value'?(a,b)=>value(b)-value(a)||(avgR(b.s.url)??0)-(avgR(a.s.url)??0)||cmp(a)-cmp(b):mode==='rating'?byR(avgR):mode==='google'?byR(googR):mode==='wolt'?byR(woltR):mode==='name'?(a,b)=>a.s.name.localeCompare(b.s.name,'sv')||cmp(a)-cmp(b):mode==='price'?(a,b)=>cmp(a)-cmp(b)||tie(a,b):mode==='minorder'?(a,b)=>minGap(a.price,minOf(a))-minGap(b.price,minOf(b))||cmp(a)-cmp(b)||tie(a,b):mode==='liter'?(a,b)=>perL(a)-perL(b)||cmp(a)-cmp(b)||tie(a,b):byDeal);
 // Öppna restauranger före stängda (utom vid sortering på pris, namn och literpris). Bland erbjudandena får varje restaurang
 // högst två rätter innan nästa restaurang får plats (inom samma erbjudandenivå), så att en restaurang inte fyller listan.
 if(!['price','name','liter'].includes(mode)){const shut=r=>openState(r.s.url)?.open===false?1:0,rank=new Map(),seen=new Map(),idx=new Map(sorted.map((r,i)=>[r,i]));
  if(mode==='deals')for(const r of sorted){if(!r.deal.level)continue;const k=r.s.url+'|'+r.deal.level,n=seen.get(k)||0;seen.set(k,n+1);rank.set(r,n>>1);}
  const key=r=>mode==='deals'&&r.deal.level?[0,shut(r),-r.deal.level,rank.get(r),idx.get(r)]:[mode==='deals'?1:0,shut(r),0,0,idx.get(r)];
  sorted.sort((a,b)=>{const x=key(a),y=key(b);for(let i=0;i<5;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;});}
 // Vid sökning: träffar i rättens eller restaurangens namn före träffar i beskrivningen (erbjudandena behåller sin plats först).
 if(q)sorted.sort((a,b)=>(mode==='deals'?Number(!a.deal.level)-Number(!b.deal.level):0)||Number(!nameHit(a))-Number(!nameHit(b)));
 // Billigare sedan igår: priset har sjunkit minst 3 kr sedan förra dagens avläsning. Visas överst (bästa erbjudanden-läget).
 const dayOf=d=>String(d).slice(0,10),fell=r=>r.stats.change<=-300&&r.stats.points.length>1&&dayOf(r.stats.points.at(-2).date)<dayOf(r.stats.points.at(-1).date);
 const drops=mode==='deals'?[...new Map(sorted.filter(fell).sort((a,b)=>Number(favs.has(favKey(b)))-Number(favs.has(favKey(a)))||a.stats.change-b.stats.change).map(r=>[dupKey(r),r])).values()].slice(0,8):[],dropSet=new Set(drops);
 // Samma rätt till samma pris hos flera restauranger (t.ex. kedjor) visas som ett kort.
 also=new Map();const first=new Map(),selected=[];for(const r of drops)also.set(r,[]);
 for(const r of sorted){if(dropSet.has(r))continue;const k=dupKey(r),f=first.get(k);if(f){also.get(f).push(r);continue;}first.set(k,r);also.set(r,[]);selected.push(r);}
 const total=mode==='deals'?selected.filter(r=>r.deal.level).length:0,visible=selected.slice(0,limit),offers=visible.slice(0,total),rest=visible.slice(total);
 const section=(title,list,note)=>list.length?`<h2 class="group">${title} <span>${note}</span></h2><div class="grid">${list.map(card).join('')}</div>`:'';
 // Tom lista: säg vilka val som tillsammans ger noll träffar och erbjud att ta bort dem (t.ex. Mexikanskt + Bara erbjudanden).
 const emptyNote=()=>{const opt=id=>$(id).selectedOptions[0]?.textContent,why=[sub&&(SUBCATS[current]||[]).find(c=>c.key===sub)?.label,q&&`sökningen ”${$('#search').value.trim()}”`,
  $('#onlyDeals').checked&&'Bara erbjudanden',onlyMine&&'Mina restauranger',$('#openNow').checked&&!$('#openNow').parentElement.hidden&&'Öppet nu',restaurant&&opt('#restaurant'),cuisine&&opt('#cuisine'),
  budget!==Infinity&&`max ${$('#budget').value} kr`,['veg','vegan'].includes(dietSel)&&opt('#diet'),minRating&&opt('#minRating'),minGoogle&&opt('#minGoogle'),cheaperIn.length&&'Billigare på '+cheaperIn.map(([id])=>id==='#fdCheaper'?'Foodora':'Uber Eats').join('/')].filter(Boolean);
  return `<div class="empty"><p>Inga rätter matchar ${why.length?`<b>${why.map(esc).join(' + ')}</b>`:'filtren'} just nu.</p><p class="empty-actions">${sub?'<button type="button" data-clear="sub">Ta bort snabbfiltret</button>':''}${why.length?'<button type="button" data-clear="all">Återställ alla filter</button>':''}</p></div>`;};
 $('#cards').innerHTML=(section('Billigare sedan igår',drops,drops.length+' st')+section('Bästa erbjudandena',offers,total+' st')+section(total?'Övriga rätter':'Alla rätter',rest,(selected.length-total)+' st'+({price:', billigast först',minorder:', närmast minsta ordervärdet först',value:', mest för pengarna först',rating:', bäst betyg först',google:', bäst Google-betyg först',wolt:', bäst Wolt-betyg först'}[mode]||'')))||emptyNote();
 $('#more').hidden=selected.length<=limit;
 $('#cards').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>showHistory(rows[Number(b.dataset.index)])));
}
// Beställningen: rätter per restaurang med antal; totalsumma, uppskattade avgifter, minsta order och samma beställning på Foodora/Uber Eats.
// Under minsta ordervärdet föreslås en rätt till från samma restaurang, närmast minsta ordervärdet först (över eller under).
let fill={tab:'',n:8};const COURSE_LABEL=Object.fromEntries(COURSES);
function fillList(s,sum,min){
 const all=fillUp(rows.filter(r=>r.s.url===s.url).map(r=>({key:cartKey(r),name:r.item.name,price:r.price,course:r.course})),sum,min);if(!all.length)return '';
 const tabs=COURSES.filter(([k])=>all.some(i=>i.course===k)),list=all.filter(i=>!fill.tab||i.course===fill.tab),shown=list.slice(0,fill.n);
 const diff=d=>d===0?'<span class="diff over">precis</span>':d>0?`<span class="diff over">${money(d)} över</span>`:`<span class="diff under">${money(-d)} kvar</span>`;
 return `<li class="fill"><p class="fill-head"><b>Fyll upp i stället för att betala avgiften</b> <small>En rätt till, närmast ${money(min)} först</small></p>
  ${tabs.length>1?`<div class="fill-tabs">${[['','Alla'],...tabs].map(([k,l])=>`<button type="button" data-fill-tab="${k}" aria-pressed="${fill.tab===k}"${fill.tab===k?' class="on"':''}>${esc(l)}</button>`).join('')}</div>`:''}
  <ol>${shown.map(i=>`<li><button type="button" class="fill-add" data-qty="${esc(i.key)}" data-d="1" aria-label="Lägg till ${esc(i.name)}">+</button><span>${esc(i.name)}${fill.tab?'':` <small>${esc(COURSE_LABEL[i.course]||'')}</small>`}</span>${diff(i.diff)}<b>${money(i.price)}</b></li>`).join('')}</ol>
  ${list.length>shown.length?`<button type="button" class="fill-more" data-fill-more>Visa fler (${list.length-shown.length})</button>`:''}</li>`;
}
function renderCart(){
 const lines=cart.map(c=>({...c,r:rowByKey.get(c.key)})).filter(c=>c.r),n=lines.reduce((a,c)=>a+c.qty,0);
 $('#cartBar').hidden=!n;if(!n){if($('#cartDialog').open)$('#cartDialog').close();return;}
 const groups=[...lines.reduce((m,c)=>m.set(c.r.s.url,[...(m.get(c.r.s.url)||[]),c]),new Map()).values()];
 const left=groups.reduce((a,g)=>{const min=vinfo?.[g[0].r.s.url]?.minOrder,sum=g.reduce((x,c)=>x+c.r.price*c.qty,0);return a+(min&&sum<min?min-sum:0);},0);
 $('#cartBar').innerHTML=`<span>🛒 Beställning · ${n} ${n===1?'rätt':'rätter'}${left?` · <small>${money(left)} kvar till minsta order</small>`:''}</span><b>${money(lines.reduce((a,c)=>a+c.r.price*c.qty,0))}</b>`;
 $('#cartList').innerHTML=groups.map(g=>{const s=g[0].r.s,sum=g.reduce((a,c)=>a+c.r.price*c.qty,0),orig=g.reduce((a,c)=>a+c.r.item.originalPrice*c.qty,0),f=s.other?null:withFees(fees,s.name,sum,orig),min=vinfo?.[s.url]?.minOrder;
  const other=(k,label,price)=>{const have=g.filter(c=>c.r[k]!=null);if(!have.length)return '';const tot=have.reduce((a,c)=>a+c.r[k]*c.qty,0),part=have.length<g.length?` (${have.length} av ${g.length} rätter finns)`:'';return `<li class="cmp">${label}: ${money(tot)}${part}${have.length===g.length?(tot<sum?` · <b>${money(sum-tot)} billigare</b>`:tot>sum?` · ${esc(s.label||'Wolt')} ${money(tot-sum)} billigare`:''):''} <small>menypris</small></li>`;};
  return `<section class="cart-venue"><h3>${esc(s.name)}${stars(s.url)}${hoursTag(s.url)}</h3><ul>${g.map(c=>`<li><span>${esc(c.r.item.name)}</span><span class="qty"><button type="button" data-qty="${esc(c.key)}" data-d="-1" aria-label="En mindre">−</button>${c.qty}<button type="button" data-qty="${esc(c.key)}" data-d="1" aria-label="En till">+</button></span><b>${money(c.r.price*c.qty)}</b></li>`).join('')}
   <li class="sum"><span>Delsumma</span><b>${money(sum)}</b></li>${f?`<li class="sum"><span>≈ med avgifter <small>(uppskattat, ${Math.round(f.ratio*1000)/10} % av ordinarie pris)</small></span><b>${money(f.total)}</b></li>`:''}${min?(sum<min?`<li class="warn">${money(min-sum)} kvar till minsta ordervärde ${money(min)} (annars tillkommer en avgift för liten beställning)</li>${fillList(s,sum,min)}`:`<li class="ok">Över minsta ordervärde ${money(min)}</li>`):''}${other('fdp','Foodora')}${other('uep','Uber Eats')}</ul><a class="order" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Beställ på ${esc(s.label||'Wolt')} ↗</a></section>`;}).join('');
}
function addToCart(r,d=1){const k=cartKey(r),c=cart.find(x=>x.key===k);if(c)c.qty+=d;else if(d>0)cart.push({key:k,qty:d});cart=cart.filter(x=>x.qty>0);store('woltpriser-cart',cart);renderCart();}
// Prisgraf: trappsteg per app (priset gäller tills nästa avläsning ändrar det), egna köp som punkter, streckat vanligt pris,
// prisaxel med stödlinjer och en markör med datum och pris vid hovring/tryck. Färg och form skiljer apparna åt.
const SRC={meny:{label:'Wolt-menyn',cls:'wolt'},foodora:{label:'Foodora-menyn',cls:'fd'},ubereats:{label:'Uber Eats-menyn',cls:'ue'},kvitto:{label:'Eget köp',cls:'own'}};
function priceChart(pts,median,when){
 // Ritas i ungefär den bredd den visas i (dialogen är max 620 px), så att text och punkter behåller sin storlek på mobil.
 const W=Math.round(Math.max(290,Math.min(560,innerWidth-70))),H=Math.round(W<420?200:220),L=50,R=12,T=14,B=34,prices=pts.map(p=>p.price).concat(median?[median]:[]);let low=Math.min(...prices),high=Math.max(...prices);
 const pad=Math.max((high-low)*0.12,500);low=Math.max(0,low-pad);high=high+pad;
 const t0=Date.parse(pts[0].date),t1=Date.parse(pts.at(-1).date),span=t1-t0||1;
 const X=p=>L+(Date.parse(p.date)-t0)/span*(W-L-R),Y=v=>T+(1-(v-low)/(high-low))*(H-T-B),f=n=>n.toFixed(1),kr=v=>Math.round(v/100)+' kr';
 const ticks=[0,0.5,1].map(k=>low+(high-low)*k);
 const step=list=>list.length?'M'+list.map((p,i)=>(i?`H${f(X(p))}V${f(Y(p.price))}`:`${f(X(p))},${f(Y(p.price))}`)).join('')+(list.at(-1)!==pts.at(-1)?'':''):'';
 const groups=['meny','foodora','ubereats'].map(k=>[k,pts.filter(p=>(p.source||'meny')===k)]).filter(([,l])=>l.length);
 const mark=(p,i)=>{const x=f(X(p)),y=f(Y(p.price)),c=SRC[p.source]?.cls||'wolt';
  return p.source==='foodora'?`<rect class="pt ${c}" x="${f(X(p)-4.5)}" y="${f(Y(p.price)-4.5)}" width="9" height="9" rx="2"/>`:p.source==='ubereats'?`<path class="pt ${c}" d="M${x} ${f(Y(p.price)-5.5)}l5.5 10h-11z"/>`:p.source==='kvitto'?`<circle class="pt ${c}" cx="${x}" cy="${y}" r="5"${p.estimated?' stroke-dasharray="2 2"':''}/>`:`<circle class="pt ${c}" cx="${x}" cy="${y}" r="4.5"/>`;};
 const svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prisutveckling från ${esc(money(pts[0].price))} till ${esc(money(pts.at(-1).price))}">
  ${ticks.map(v=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${f(Y(v))}" y2="${f(Y(v))}"/><text class="axis" x="${L-8}" y="${f(Y(v)+4)}" text-anchor="end">${kr(v)}</text>`).join('')}
  ${median?`<line class="median" x1="${L}" x2="${W-R}" y1="${f(Y(median))}" y2="${f(Y(median))}"/><text class="axis med" x="${W-R}" y="${f(Y(median)-5)}" text-anchor="end">vanligt pris ${kr(median)}</text>`:''}
  ${groups.map(([k,l])=>`<path class="line ${SRC[k].cls}" d="${step(l)}"/>`).join('')}
  ${pts.map(mark).join('')}
  <line class="cross" x1="0" x2="0" y1="${T}" y2="${H-B}" visibility="hidden"/>
  <text class="axis" x="${L}" y="${H-10}">${esc(when(pts[0]))}</text><text class="axis" x="${W-R}" y="${H-10}" text-anchor="end">${esc(when(pts.at(-1)))}</text>
  <rect class="hit" x="${L}" y="0" width="${W-L-R}" height="${H}" fill="transparent"/></svg>`;
 const used=[...new Set(pts.map(p=>p.source||'meny'))];
 return `<div class="pchart" data-w="${W}" data-pts='${esc(JSON.stringify(pts.map(p=>({x:X(p)/W,y:Y(p.price)/H,price:p.price,when:when(p),src:SRC[p.source||'meny']?.label||'',est:!!p.estimated}))))}'>${svg}<div class="tip" hidden></div></div>${used.length>1?`<p class="legend">${used.map(k=>`<span class="dot ${SRC[k].cls}"></span> ${SRC[k].label}${k==='kvitto'?' (pris efter rabatt)':''}`).join(' ')}</p>`:''}`;
}
// Hovring/tryck i prisgrafen: närmaste punkt i tid visas med datum, pris och app.
document.addEventListener('pointermove',e=>chartHover(e));document.addEventListener('pointerdown',e=>chartHover(e));
function chartHover(e){const box=e.target.closest?.('.pchart');for(const c of document.querySelectorAll('.pchart'))if(c!==box){c.querySelector('.tip').hidden=true;c.querySelector('.cross')?.setAttribute('visibility','hidden');}
 if(!box)return;const r=box.querySelector('svg').getBoundingClientRect(),fx=(e.clientX-r.left)/r.width,pts=JSON.parse(box.dataset.pts);
 const p=pts.reduce((a,b)=>Math.abs(b.x-fx)<Math.abs(a.x-fx)?b:a),tip=box.querySelector('.tip'),cross=box.querySelector('.cross'),W=Number(box.dataset.w);
 cross.setAttribute('x1',p.x*W);cross.setAttribute('x2',p.x*W);cross.setAttribute('visibility','visible');
 tip.hidden=false;tip.innerHTML=`<b>${esc(money(p.price))}</b>${p.est?' (uppskattat)':''}<span>${esc(p.when)} · ${esc(p.src)}</span>`;
 const left=Math.min(Math.max(p.x*r.width-tip.offsetWidth/2,0),r.width-tip.offsetWidth);tip.style.left=left+'px';tip.style.top=Math.max(p.y*r.height-tip.offsetHeight-12,0)+'px';}
function showHistory(r){$('#historyTitle').textContent=r.item.name;$('#historyRestaurant').textContent=r.s.name;
 const pts=[...r.stats.points.map(p=>({...p,source:r.s.platform||'meny'})),...receiptPoints(receipts,r.s.name,r.item.id,r.item.name),...foodoraPoints(r.item.fd,$('#fdPro').checked),...foodoraPoints(r.item.ue,false,'ubereats')].sort((a,b)=>a.date.localeCompare(b.date));
 const day=d=>new Date(d).toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm',month:'short',day:'numeric'}),when=p=>p.source==='kvitto'?day(p.date):fmt(p.date);
 if(pts.length<2)$('#chart').innerHTML='<p class="notice">Första priset är sparat. När nästa avläsning är klar visas utvecklingen här.</p>';
 else $('#chart').innerHTML=priceChart(pts,r.stats.median,when);
 const src=p=>p.source==='foodora'?(p.from?'Foodora (från-pris)':'Foodora'):p.source==='ubereats'?'Uber Eats':p.source==='kvitto'?(p.estimated?'Eget köp, uppskattat':'Eget köp'):'Wolt';
 $('#historyRows').innerHTML=`<table><thead><tr><th>Datum</th><th>Pris</th><th>Källa</th></tr></thead><tbody>${[...pts].reverse().map(p=>`<tr><td>${esc(when(p))}</td><td>${money(p.price)}</td><td>${src(p)}</td></tr>`).join('')}</tbody></table><p>Jämförelse med ${r.stats.days} tidigare dagar. ${r.stats.days<7?'Minst 7 tidigare dagar krävs för märkningen ”ovanligt lågt”.':''} Egna köp visar vad rätten kostade efter rabatt, utan avgifter och tillval, och räknas inte in i märkningarna.</p>`;$('#historyDialog').showModal();
}
$('#closeDialog').onclick=()=>$('#historyDialog').close();$('#closeDish').onclick=()=>$('#dishDialog').close();$('#more').onclick=()=>{limit+=24;render();};
// Fler rätter laddas automatiskt när man närmar sig slutet av listan; knappen finns kvar som reserv.
if('IntersectionObserver' in window){let busy=false;const io=new IntersectionObserver(es=>{if(!es.some(e=>e.isIntersecting)||busy||$('#more').hidden)return;busy=true;requestAnimationFrame(()=>{limit+=24;render();busy=false;const r=$('#more').getBoundingClientRect();if(!$('#more').hidden&&r.top<innerHeight+800){io.unobserve($('#more'));io.observe($('#more'));}});},{rootMargin:'0px 0px 800px 0px'});io.observe($('#more'));}
// Filter: maxpris med reglage (högsta läget = inget tak), snabbval, valfritt pris med avgifter. Valen sparas i webbläsaren.
const NO_LIMIT=305,DEFAULTS={search:'',restaurant:'',cuisine:'',onlyMine:false,budget:NO_LIMIT,sort:'deals',size:'all',withFees:false,plus:true,onlyDeals:false,apps:'wolt',minRating:'0',minGoogle:'0',diet:'nofish',openNow:false,fdPro:false,fdCheaper:false,ueCheaper:false},KEY='woltpriser-filter';
const maxPrice=()=>{const v=Number($('#budget').value);return v>=NO_LIMIT?Infinity:v*100;},cmp=r=>$('#withFees').checked&&r.fees?r.fees.total:r.price;
const readFilters=()=>({search:$('#search').value,restaurant:$('#restaurant').value,cuisine:$('#cuisine').value,onlyMine:$('#onlyMine').checked,budget:Number($('#budget').value),sort:$('#sort').value,size:$('input[name=size]:checked')?.value||'all',withFees:$('#withFees').checked,plus:$('#plus').checked,onlyDeals:$('#onlyDeals').checked,apps:$('#apps').value,minRating:$('#minRating').value,minGoogle:$('#minGoogle').value,diet:$('#diet').value,openNow:$('#openNow').checked,fdPro:$('#fdPro').checked,fdCheaper:$('#fdCheaper').checked,ueCheaper:$('#ueCheaper').checked});
function writeFilters(f){$('#search').value=f.search;$('#cuisine').value=f.cuisine||'';if($('#cuisine').value!==(f.cuisine||''))$('#cuisine').value='';$('#onlyMine').checked=!!f.onlyMine;$('#restaurant').value=f.restaurant;if($('#restaurant').value!==f.restaurant)$('#restaurant').value='';$('#budget').value=f.budget;$('#sort').value=f.sort;if($('#sort').value!==f.sort)$('#sort').value='deals';($(`input[name=size][value="${f.size}"]`)||$('input[name=size][value="all"]')).checked=true;for(const k of ['withFees','plus','onlyDeals','fdCheaper','fdPro','ueCheaper','openNow'])$('#'+k).checked=!!f[k];$('#apps').value=['wolt','all','other'].includes(f.apps)?f.apps:f.showOther?'all':'wolt';$('#minRating').value=f.minRating==='8.5'?'8':f.minRating||'0';if(!$('#minRating').value)$('#minRating').value='0';$('#minGoogle').value=f.minGoogle||'0';if(!$('#minGoogle').value)$('#minGoogle').value='0';// Kost: all, nofish (standard), veg, vegan. Äldre sparade filter hade en egen fiskruta (noFish) och diet ''.
 const diet=f.diet||(f.noFish===false?'all':'nofish');$('#diet').value=diet;if($('#diet').value!==diet)$('#diet').value='nofish';}
function syncFilters(list,budget){
 const f=readFilters(),fees=f.withFees;$('#budgetOut').textContent=budget===Infinity?'Inget tak':`${f.budget} kr${fees?' inkl. avgifter':''}`;
 $('#budget').style.setProperty('--fill',((f.budget-50)/(NO_LIMIT-50)*100)+'%');
 for(const b of document.querySelectorAll('.price-quick button'))b.classList.toggle('active',Number(b.dataset.max)===f.budget);
 const step=1000,lo=5000,hi=30000,bins=Array.from({length:(hi-lo)/step+1},()=>0);
 for(const r of list){const p=cmp(r);bins[p>=hi?bins.length-1:Math.max(0,Math.floor((p-lo)/step))]++;}
 const top=Math.max(1,...bins);$('#histo').innerHTML=bins.map((n,i)=>`<i style="height:${n?Math.max(6,n/top*100):0}%"${lo+i*step<=Math.min(budget,hi)?' class="in"':''}></i>`).join('');
 const changed=Object.keys(DEFAULTS).filter(k=>!['search','budget','sort'].includes(k)&&f[k]!==DEFAULTS[k]).length;
 $('#filterSummary').textContent=[budget===Infinity?'':`Max ${f.budget} kr`,{price:'Lägst pris',minorder:'Närmast minsta order',name:'Restaurang',liter:'Literpris',value:'Mest för pengarna',rating:'Bäst betyg',google:'Bäst Google-betyg',wolt:'Bäst Wolt-betyg'}[f.sort]||'',changed?`${changed} ${changed===1?'val':'val'}`:''].filter(Boolean).join(' · ')||'Bästa erbjudanden först';
 for(const el of document.querySelectorAll('.fgroup .chip.sel select'))el.parentElement.classList.toggle('on',el.selectedIndex>0);$('#clearSearch').hidden=!f.search;$('#resetFilters').hidden=JSON.stringify(f)===JSON.stringify(DEFAULTS);
 try{localStorage.setItem(KEY,JSON.stringify({...f,search:''}));}catch{}
}
// Sökrutan ritar om efter en kort paus i skrivandet, övriga filter direkt.
let typing=0;$('.filterpanel').addEventListener('input',e=>{clearTimeout(typing);const go=()=>{limit=24;render();};if(e.target.id==='search')typing=setTimeout(go,180);else go();});
$('.filterpanel').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.max)$('#budget').value=b.dataset.max;else if(b.id==='clearSearch'){$('#search').value='';$('#search').focus();}else if(b.id==='resetFilters')writeFilters(DEFAULTS);else return;limit=24;render();});
// Filterpanelens öppet/stängt-läge minns i webbläsaren.
{const PK='woltpriser-panel';let o=false;try{o=localStorage.getItem(PK)==='1';}catch{}$('.filterpanel').classList.toggle('open',o);$('#filterToggle').setAttribute('aria-expanded',o);
 $('#filterToggle').addEventListener('click',()=>{const open=$('.filterpanel').classList.toggle('open');$('#filterToggle').setAttribute('aria-expanded',open);try{localStorage.setItem(PK,open?'1':'0');}catch{}});}
document.addEventListener('click',e=>{
 const fb=e.target.closest('[data-fav]');if(fb){const r=rows[Number(fb.dataset.fav)],k=favKey(r);favs.has(k)?favs.delete(k):favs.add(k);store('woltpriser-favs',[...favs]);render();return;}
 const ab=e.target.closest('[data-add]');if(ab){addToCart(rows[Number(ab.dataset.add)]);ab.textContent='✓ Tillagd';setTimeout(()=>{ab.textContent='+ Lägg till';},1200);return;}
 const qb=e.target.closest('[data-qty]');if(qb){const r=rowByKey.get(qb.dataset.qty);if(r)addToCart(r,Number(qb.dataset.d));return;}
 if(e.target.closest('#cartBar')){renderCart();$('#cartDialog').showModal();return;}
 if(e.target.closest('#closeCart')){$('#cartDialog').close();return;}
 const ft=e.target.closest('[data-fill-tab]');if(ft){fill={tab:ft.dataset.fillTab,n:8};renderCart();return;}
 if(e.target.closest('[data-fill-more]')){fill.n+=12;renderCart();return;}
 if(e.target.closest('#clearCart')){cart=[];store('woltpriser-cart',cart);renderCart();return;}
 const v=e.target.closest('.vlink');if(v){$('#restaurant').value=v.dataset.url;if($('#restaurant').value!==v.dataset.url)return;limit=24;sub='';render();scrollTo({top:$('#tabs').offsetTop-8,behavior:'smooth'});return;}
 if(e.target.closest('#clearVenue')){$('#restaurant').value='';limit=24;render();}});
$('#cards').addEventListener('click',e=>{const b=e.target.closest('[data-clear]');if(!b)return;sub='';if(b.dataset.clear==='all'){writeFilters(DEFAULTS);$('#search').value='';}limit=24;render();});
$('#subcats').addEventListener('click',e=>{const b=e.target.closest('[data-sub]');if(!b)return;sub=sub===b.dataset.sub?'':b.dataset.sub;limit=24;render();});
addEventListener('hashchange',()=>{limit=24;sub='';render();scrollTo({top:$('#tabs').offsetTop-8,behavior:'smooth'});});
const wantOther=()=>{const u=filtersFromUrl()?.f?.apps;if(u)return u!=='wolt';try{return (JSON.parse(localStorage.getItem(KEY)||'{}').apps||'wolt')!=='wolt';}catch{return false;}};
$('#apps').addEventListener('change',()=>{if($('#apps').value!=='wolt'&&[foodora,ubereats].some(st=>st?.otherFile&&!st.loaded)){$('#notice').hidden=false;$('#notice').textContent='Hämtar restauranger utanför Wolt …';setTimeout(()=>location.reload(),50);}});
let venueList,discovered;try{[receipts,images,fees,foodora,venueList,discovered,ubereats,ratings,vinfo,google]=await Promise.all(['receipts','images','fees','foodora','venues','discovered','ubereats','ratings','venueinfo','google'].map(n=>fetch(`./data/${n}.json`,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null)));fees=feeModel(fees);
 // Restauranger utanför Wolt ligger i egna filer på den publicerade sidan (scripts/split-compare.mjs). De hämtas bara när
 // väljaren Appar (i webbadressen eller sparade filter) visar dem; byts väljaren senare laddas sidan om med dem.
 if(wantOther())for(const st of [foodora,ubereats])if(st?.otherFile){const o=await fetch(`./data/${st.otherFile}`,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);if(o){Object.assign(st.venues,o.venues);st.loaded=true;}}
 for(const [sel,st] of [['.chip.fd',foodora],['.chip.ue',ubereats]])for(const c of document.querySelectorAll(sel)){c.hidden=!Object.keys(st?.venues||{}).length;}const response=await fetch('./data/history.json',{cache:'no-cache'});if(!response.ok)throw Error('Prisdata kunde inte hämtas');history=normalizeHistory(await response.json());if(!history.readings?.length)throw Error('Ingen avläsning har importerats ännu.');latest=latestSnapshots(history);for(const s of latest)for(const [store,key] of [[foodora,'fd'],[ubereats,'ue']]){const m=foodoraMenu(store,s.url);if(m&&!stale(m.observedAt))for(const item of s.items){const f=matchFoodora(m,item);if(f)item[key]={...f,venue:m.url,at:m.observedAt};}}
 // Restauranger som bara finns på Foodora/Uber Eats: visas som egna restauranger (väljaren Wolt / Wolt + andra appar / Bara utanför Wolt).
 // Samma restaurang i båda apparna slås ihop; huvudappen ger priset och den andra jämförs som på Wolt-korten.
 const woltCount=latest.length,KEYS={foodora:'fd',ubereats:'ue'};
 for(const {main,others} of otherVenues([[foodora,FOODORA],[ubereats,UBEREATS]],new Set(latest.map(s=>venueKey(s.name))))){const mm=main.menu,p=main.p;
  const s={name:mm.name,url:mm.url,observedAt:mm.observedAt,other:true,platform:p.key,label:p.label,items:mm.items.map(i=>({id:p.key+':'+i.id,name:i.name,description:'',category:i.category,price:i.price,originalPrice:i.originalPrice,proPrice:p.key==='foodora'?i.proPrice:null,from:i.from,woltPlus:false,available:true,timeline:logTimeline(i.log,false)}))};
  for(const o of others)if(!stale(o.menu.observedAt))for(const item of s.items){const f=matchFoodora(o.menu,item);if(f)item[KEYS[o.p.key]]={...f,venue:o.menu.url,at:o.menu.observedAt};}
  latest.push(s);}
 $('#appsBox').hidden=latest.length===woltCount&&![foodora,ubereats].some(st=>st?.other);$('#openNow').parentElement.hidden=!vinfo||!Object.values(vinfo).some(v=>v.hours);$('#googleBox').hidden=!Object.values(google||{}).some(g=>g.rating!=null);
 // Exempelbilder: samma bild hos restauranger av olika märken (Wolts bildbank, t.ex. en läskburk eller en generisk sallad).
 // Kedjor (samma första namnord, t.ex. McDonald's X och McDonald's Y) räknas inte; deras bilder är restaurangens egna.
 {const brand=n=>venueKey(n).replace(/\b(restaurang|restaurant|pizzeria|pizza|cafe|kafe|the|bar|grill|kok|sushi|thai)\b/g,' ').trim().split(' ')[0]||venueKey(n),seen=new Map(),names=new Map(latest.map(s=>[s.url,s.name]));
  for(const [url,o] of Object.entries(images?.venues||{})){const b=brand(names.get(url)||url);for(const u of Object.values(o.items||{})){if(!seen.has(u))seen.set(u,new Set());seen.get(u).add(b);}}
  for(const [u,b] of seen)if(b.size>1)stock.add(u);}
 for(const s of latest)for(const item of s.items){item.stats={true:analyze(item.timeline,item,true,s.observedAt)};item.course=course(item);item.subs=subcatsFor(item,item.course);item.ml=item.course==='dryck'?volumeMl(item.name):null;item.bought=purchases(receipts,s.name,item.id,item.name);item.tokens=tokens(item.name);item.text=(item.name+' '+item.description+' '+s.name).toLocaleLowerCase('sv');item.fish=seafood(item);item.diet=diet(item);}
 const idf=dishIndex(latest.flatMap(s=>s.items.map(i=>i.name)));groups=dishGroups(receipts?.prices||[],idf).filter(g=>g.times>=2);for(const g of groups){g.members=new Map();for(const s of latest)for(const i of s.items){const k=matchKind(g,idf,s.name,i,i.tokens);if(k)g.members.set(i,k);}
  // Favoritens flik (för snabbfiltren under Mina rätter): fliken för samma rätt (exakt namn) väger tyngst, sedan liknande och varianter; annars utifrån namnet.
  const n={};for(const [i,k] of g.members)if(i.course)n[i.course]=(n[i.course]||0)+(k==='exact'?100:k==='similar'?10:1);g.course=Object.entries(n).sort((a,b)=>b[1]-a[1])[0]?.[0]||course({name:g.title,category:'',price:0,originalPrice:0})||'mat';}
 const last=history.readings.at(-1).observedAt,dates=new Set(history.readings.map(r=>r.observedAt.slice(0,10)));const woltV=latest.slice(0,woltCount);$('#status').textContent=`${woltV.length} restauranger · ${woltV.reduce((n,s)=>n+s.items.filter(i=>i.available).length,0)} rätter · uppdaterad ${fmt(last)}${latest.length>woltCount?` · ${latest.length-woltCount} utanför Wolt`:''}`;let saved=null;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
 mineUrls=new Set((Array.isArray(venueList)?venueList:[]).map(v=>v.url).filter(Boolean));meta=new Map((discovered?.venues||[]).map(v=>[v.url,v]));
 const opt=s=>`<option value="${esc(s.url)}">${esc(s.name)}</option>`,byName=(a,b)=>a.name.localeCompare(b.name,'sv'),mineV=woltV.filter(s=>mineUrls.has(s.url)).sort(byName),otherV=woltV.filter(s=>!mineUrls.has(s.url)).sort(byName),outV=latest.slice(woltCount).sort(byName);
 $('#restaurant').innerHTML+=mineV.length&&otherV.length?`<optgroup label="Mina restauranger">${mineV.map(opt).join('')}</optgroup><optgroup label="Övriga restauranger">${otherV.map(opt).join('')}</optgroup>`:[...mineV,...otherV].map(opt).join('');if(outV.length)$('#restaurant').innerHTML+=`<optgroup label="Inte på Wolt">${outV.map(s=>`<option value="${esc(s.url)}">${esc(s.name)} (${esc(s.label)})</option>`).join('')}</optgroup>`;
 const tagCount=new Map();for(const s of woltV)for(const t of meta.get(s.url)?.tags||[])tagCount.set(t,(tagCount.get(t)||0)+1);
 $('#cuisine').innerHTML+=[...tagCount].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'sv')).slice(0,30).map(([t,n])=>`<option value="${esc(t)}">${esc(t.charAt(0).toLocaleUpperCase('sv')+t.slice(1))} (${n})</option>`).join('');$('#cuisine').closest('label').hidden=!tagCount.size;$('#onlyMine').closest('label').hidden=!mineUrls.size||!otherV.length;
 const age=(Date.now()-Date.parse(last))/3600000;$('#notice').textContent=age>30?`Prislistan är ${Math.floor(age)} timmar gammal. Kontrollera dagens priser hos Wolt.`:dates.size<8?`Prishistoriken har ${dates.size} ${dates.size===1?'dag':'dagar'}. Kampanjer visas redan nu; ”Ovanligt billigt” kräver minst 7 tidigare mätdagar.`:'';$('#notice').hidden=!$('#notice').textContent;const fromUrl=filtersFromUrl();if(fromUrl||saved&&typeof saved==='object')writeFilters({...DEFAULTS,...(saved||{}),...(fromUrl?.f||{})});if(fromUrl?.sub)sub=fromUrl.sub;render();
}catch(e){$('#notice').textContent=e.message;$('#cards').innerHTML='<div class="empty">Prislistan är inte tillgänglig just nu. Försök igen senare.</div>';}
