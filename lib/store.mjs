// Sparar menyavläsningar till data/*.json. Används av både importformuläret och scrapern.
import fs from 'node:fs/promises';
import path from 'node:path';
import {mergeHistory,emptyHistory,validateBatch,mergeImages,emptyImages,mergeVenues} from './prices.mjs';
import {mergeFoodora,emptyFoodora} from './foodora.mjs';

const readJson=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const writeAtomic=async(file,text)=>{await fs.writeFile(file+'.tmp',text);await fs.rename(file+'.tmp',file);};

export const loadHistory=root=>readJson(path.join(root,'data/history.json'),emptyHistory());
export const loadVenues=root=>readJson(path.join(root,'data/venues.json'),[]);
export const loadMember=root=>readJson(path.join(root,'data/member.json'),emptyHistory());

// Validerar hela batchen först; ett fel sparar ingenting.
export async function saveSnapshots(root,batch,{addVenues=true}={}){
 const snapshots=validateBatch(batch);
 const hfile=path.join(root,'data/history.json'),ifile=path.join(root,'data/images.json'),vfile=path.join(root,'data/venues.json');
 const history=mergeHistory(await loadHistory(root),{snapshots});
 const images=mergeImages(await readJson(ifile,emptyImages()),snapshots);
 const venues=mergeVenues(await loadVenues(root),history,{addNew:addVenues});
 await writeAtomic(hfile,JSON.stringify(history));
 await writeAtomic(ifile,JSON.stringify(images));
 await writeAtomic(vfile,JSON.stringify(venues,null,2)+'\n');
 return {history,venues};
}

// Dina priser från din inloggade webbläsare: sparas i member.json, inte i grunddatan. Bilder uppdateras också.
export async function saveMember(root,batch){
 const snapshots=validateBatch(batch);
 const mfile=path.join(root,'data/member.json'),ifile=path.join(root,'data/images.json');
 const member=mergeHistory(await loadMember(root),{snapshots});
 const images=mergeImages(await readJson(ifile,emptyImages()),snapshots);
 await writeAtomic(mfile,JSON.stringify(member));
 await writeAtomic(ifile,JSON.stringify(images));
 return {member};
}

// Jämförelsepriser från andra appar (data/foodora.json, data/ubereats.json). Validerar hela batchen först.
export const loadCompare=(root,p)=>readJson(path.join(root,`data/${p.key}.json`),emptyFoodora());
export async function saveCompare(root,p,list){
 const store=mergeFoodora(await loadCompare(root,p),{[p.key]:list},p);
 await writeAtomic(path.join(root,`data/${p.key}.json`),JSON.stringify(store));
 return store;
}
