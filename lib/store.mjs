// Sparar menyavläsningar till data/*.json. Används av både importformuläret och scrapern.
import fs from 'node:fs/promises';
import path from 'node:path';
import {mergeHistory,emptyHistory,validateBatch,mergeImages,emptyImages,mergeVenues} from './prices.mjs';

const readJson=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const writeAtomic=async(file,text)=>{await fs.writeFile(file+'.tmp',text);await fs.rename(file+'.tmp',file);};

export const loadHistory=root=>readJson(path.join(root,'data/history.json'),emptyHistory());
export const loadVenues=root=>readJson(path.join(root,'data/venues.json'),[]);

// Validerar hela batchen först; ett fel sparar ingenting.
export async function saveSnapshots(root,batch){
 const snapshots=validateBatch(batch);
 const hfile=path.join(root,'data/history.json'),ifile=path.join(root,'data/images.json'),vfile=path.join(root,'data/venues.json');
 const history=mergeHistory(await loadHistory(root),{snapshots});
 const images=mergeImages(await readJson(ifile,emptyImages()),snapshots);
 const venues=mergeVenues(await loadVenues(root),history);
 await writeAtomic(hfile,JSON.stringify(history));
 await writeAtomic(ifile,JSON.stringify(images));
 await writeAtomic(vfile,JSON.stringify(venues,null,2)+'\n');
 return {history,venues};
}
