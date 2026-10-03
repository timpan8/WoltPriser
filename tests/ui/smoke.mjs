// Röktest i webbläsare för sidan (app.mjs, index.html, style.css): startar den lokala servern, öppnar sidan i Chromium och
// går igenom flikar, sorteringar, filter, dialoger och webbadressen. Misslyckas vid fel i konsolen eller när något inte
// beter sig som väntat. Kräver paketet playwright (CI: npm i --no-save playwright && npx playwright install chromium).
// Användning: node tests/ui/smoke.mjs
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const port=4181,base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['scripts/server.mjs'],{env:{...process.env,WOLT_PORT:String(port)},stdio:'ignore'});
const fails=[],errors=[];
const check=(ok,what)=>{console.log(`${ok?'ok  ':'FAIL'} ${what}`);if(!ok)fails.push(what);};
try{
 for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const ctx=await browser.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
 await p.route(/imageproxy|fonts\.(googleapis|gstatic)/,r=>r.abort());
 const cards=()=>p.evaluate(()=>document.querySelectorAll('#cards .card').length);
 const settle=()=>p.waitForTimeout(250);
 await p.goto(base+'#mat');await p.waitForSelector('#cards .card',{timeout:15000});
 check(await cards()>0,'Mat visar kort');
 for(const t of ['frukost','fika','dryck','smatt','barn','mina']){await p.evaluate(t=>location.hash='#'+t,t);await settle();check(await cards()>0||await p.$('#cards .empty')!==null,`fliken ${t} renderar`);}
 await p.evaluate(()=>location.hash='#mat');await settle();
 await p.click('#filterToggle');await settle();check(await p.isVisible('#sort'),'filterpanelen öppnas');
 for(const s of await p.$$eval('#sort option:not([disabled])',o=>o.map(x=>x.value))){const t0=Date.now();await p.selectOption('#sort',s);await settle();check(await cards()>0,`sortering ${s} (${Date.now()-t0} ms)`);}
 await p.selectOption('#sort','deals');
 for(const id of ['onlyDeals','onlyMine','withFees','plus','fdPro','fdCheaper','ueCheaper','openNow']){if(await p.$eval('#'+id,e=>e.parentElement.hidden))continue;
  await p.click(`label:has(#${id})`);await settle();check(await p.$eval('#'+id,e=>e.checked)!==null,`filtret ${id} växlar`);}
 // Filter i webbadressen och efter omladdning (fel 4 i granskningen: Foodora-filtren försvann).
 const want=await p.evaluate(()=>Object.fromEntries(['onlyDeals','fdPro','fdCheaper','ueCheaper','withFees','plus'].map(id=>[id,document.getElementById(id).checked])));
 await p.reload();await p.waitForSelector('#cards .card, #cards .empty',{timeout:15000});
 const got=await p.evaluate(()=>Object.fromEntries(['onlyDeals','fdPro','fdCheaper','ueCheaper','withFees','plus'].map(id=>[id,document.getElementById(id).checked])));
 check(JSON.stringify(want)===JSON.stringify(got),`filtren finns kvar efter omladdning (${JSON.stringify(got)})`);
 await p.evaluate(()=>{for(const id of ['onlyDeals','onlyMine','withFees','fdPro','fdCheaper','ueCheaper','openNow']){const e=document.getElementById(id);if(e.checked)e.click();}});await settle();
 for(const v of ['all','veg','vegan','nofish'])await p.selectOption('#diet',v);await settle();check(await cards()>0,'kostvalet');
 await p.fill('#search','pizza');await p.waitForTimeout(500);check(await cards()>0,'sökning');await p.fill('#search','');await p.waitForTimeout(400);
 const sub=await p.$('#subcats .sub');if(sub){await sub.click();await settle();check(await cards()>0||await p.$('#cards .empty')!==null,'snabbfilter');await p.click('#subcats .sub.active');await settle();}
 if(await p.$('#cards .history-button')){await p.click('#cards .history-button');await p.waitForSelector('#historyDialog[open]',{timeout:3000});check(true,'prishistoriken öppnas');await p.click('#closeDialog');}
 if(await p.$('#cards .vlink')){await p.click('#cards .vlink');await settle();check(await p.isVisible('#venueBanner'),'restaurangvyn');await p.click('#clearVenue');await settle();}
 if(await p.$('#cards .add')){await p.click('#cards .add');await settle();await p.click('#cartBar');await p.waitForSelector('#cartDialog[open]',{timeout:3000});check(true,'beställningen öppnas');await p.keyboard.press('Escape');}
 await p.evaluate(()=>location.hash='#mina');await settle();
 if(await p.$('.card.dish .compare')){await p.click('.card.dish .compare');await p.waitForSelector('#dishDialog[open]',{timeout:3000});check(await p.$$eval('#dishList li',l=>l.length)>0,'jämförelsen öppnas');await p.click('#closeDish');}
 // Prestanda (fel 2 i granskningen): Mest för pengarna med alla appar ska rita om snabbt, även vid sökning.
 await p.goto(base+'#mat?apps=all&sort=value');await p.waitForSelector('#cards .card',{timeout:20000});
 const ms=await p.evaluate(async()=>{const t=performance.now();for(let i=0;i<3;i++){document.getElementById('budget').value=String(200+i);document.querySelector('.filterpanel').dispatchEvent(new Event('input',{bubbles:true}));}return (performance.now()-t)/3;});
 check(ms<600,`Mest för pengarna med alla appar ritas om på ${Math.round(ms)} ms (gräns 600)`);
 // Mobilbredd: inget sticker ut i sidled.
 await p.setViewportSize({width:390,height:800});await p.evaluate(()=>location.hash='#mat');await settle();
 check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ingen sidledsrullning på mobil');
 check(!errors.length,`inga fel i konsolen${errors.length?': '+errors.slice(0,3).join(' | '):''}`);
 await browser.close();
}catch(e){fails.push(e.message.split('\n')[0]);console.log('FAIL',e.message.split('\n')[0]);}
finally{server.kill();}
console.log(fails.length?`\n${fails.length} fel`:'\nAllt ok');process.exit(fails.length?1:0);
