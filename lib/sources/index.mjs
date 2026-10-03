// Register över huvudkällor för menyhistoriken (Wolt). En ny huvudkälla exporterar {id,label,matches(url),
// fetchSnapshot(venue,ctx),search(name,ctx)} och returnerar samma snapshot-format som wolt.mjs.
// Jämförelsepriser från andra appar ligger separat: ubereats.mjs (automatiskt) och Foodora (webbläsarläsning).
import wolt from './wolt.mjs';

export const sources=[wolt];
export const sourceFor=url=>sources.find(s=>s.matches(url));
export const defaultSource=wolt;
