// Register över menykällor. En ny plattform (t.ex. Foodora eller Uber Eats) läggs till som en fil här bredvid
// som exporterar {id,label,matches(url),fetchSnapshot(venue,ctx),search(name,ctx)} och returnerar samma
// snapshot-format som wolt.mjs. validateBatch i lib/prices.mjs måste då också godkänna plattformens länkar.
import wolt from './wolt.mjs';

export const sources=[wolt];
export const sourceFor=url=>sources.find(s=>s.matches(url));
export const defaultSource=wolt;
