// Snabbfilter (underkategorier) per flik, med ikon. En rätt kan höra till flera (kycklingpizza är både Pizza och Kyckling).
// Matchas mot rättens namn; för köken nedan i CATEGORY även mot menykategorin ("Pizzor", "Indiska rätter"). Kategorier som
// "Kyckling, Fisk & Vego" eller "Tillbehör & dip" säger inget om den enskilda rätten och används inte för övriga.
// not: undantag (prövas mot samma text som re: namn, och för köken i CATEGORY även menykategorin).
const S=(key,label,icon,re,not)=>({key,label,icon,re,not});
const CATEGORY=new Set(['pizza','burgare','kebab','indiskt','sushi','asiatiskt','pasta','mexikanskt','korv','kaffe','forratter','pannkakor','bowls']);
export const SUBCATS={
 mat:[
  S('pizza','Pizza','🍕',/pizz|calzone|margh?eri?ta|vesuvio|capricciosa|hawaii|kebabpizza|quattro/i),
  S('burgare','Burgare','🍔',/burg|whopper|big mac|big king|mcfeast|quarter pounder|\bqp\b/i),
  S('kebab','Kebab & falafel','🥙',/kebab|gyros|döner|doner|falafel|shawarma|souvlaki|\bpita|rulle/i,/korv|fisk|scampi|räk|kabanoss|chorizo/i),
  S('indiskt','Indiskt','🍛',/masala|tikka|korma|curry|vindaloo|madras|biryani|biriany|paneer|tandoori|\bdal\b|balti|saag|sizlar|karai|jalfrezi|bhuna/i,/thai|wok|röd curry|masaman|pa näng|mancurry|pasta|dal mare|burg/i),
  S('sushi','Sushi','🍣',/sushi|maki|nigiri|sashimi|uramaki|futomaki|norimaki|temaki/i),
  S('asiatiskt','Asiatiskt','🍜',/wok|thai|pad thai|nudl|noodle|ramen|bibimbap|poké|poke|dumpling|gyoza|bao|teriyaki|yakiniku|pho\b|curry thai|chow mein/i),
  S('pasta','Pasta','🍝',/pasta|spaghetti|lasagne|lasagna|carbonara|penne|tagliatelle|bolognese|risotto|gnocchi|ravioli|cannelloni|linguine/i,/pizz/i),
  S('kyckling','Kyckling','🍗',/kyckling|chicken|wings|vingar|nuggets|tenders|strips|bucket/i,/veggie|vego|vegan|cauliflower|califlower|green nuggets|no chicken/i),
  S('sallad','Sallad & bowls','🥗',/sallad|salad|bowl|poké|poke/i,/wings/i),
  S('mexikanskt','Mexikanskt','🌮',/taco|burrito|nacho|quesadilla|enchilada|fajita/i),
  S('korv','Korv','🌭',/korv|hot ?dog|bratwurst|kabanoss|stockholmare|chorizo/i,/\bchips\b|^fish|^chicken/i),
  S('grill','Grill & kött','🥩',/grill|biff|entrecote|oxfil|schnitzel|fläskfil|lammfil|lammkotlett|spett|steak|ribs|revben/i,/^grillad$|burg|whopper|king|pizz|pinsa|chicken|kyckling|gourmet|meal|mål\b|pasta|madras|karai|curry|indisk|grillost|korv|rullar|sushi|wok|bibimbap|bowl|unagi|ål\b/i),
  S('vego','Vegetariskt','🥦',/veg|vego|halloumi|falafel|paneer|impossible|green|tofu/i),
  S('fisk','Fisk & skaldjur','🐟',/fisk|fish|lax|salmon|räk|shrimp|prawn|scampi|tonfisk|tuna|torsk|bläckfisk|skaldjur/i)],
 frukost:[
  S('mackor','Mackor','🥪',/sandwich|macka|smörgås|baguette|panini|toast|fralla|bagel|ciabatta|croque|focaccia/i),
  S('croissant','Croissant & bakverk','🥐',/croissant|scones?|bulle|wienerbröd/i),
  S('pannkakor','Pannkakor','🥞',/pannkak|pancake|våffl|waffle/i),
  S('bowls','Bowls & yoghurt','🥣',/bowl|yoghurt|yogurt|acai|açaí|gröt|granola|müsli/i),
  S('frukost','Frukostpaket','🍳',/frukost|breakfast|brunch|ägg/i)],
 fika:[
  S('glass','Glass','🍦',/glass|gelato|sundae|ben & jerry|magnum|piggelin|ice cream|mcflurry|shake/i),
  S('kakor','Kakor & tårtor','🍰',/kaka|kakor|tårta|cake|cheesecake|brownie|paj\b|pie\b|muffin|cookie|tiramisu|pannacotta|panna cotta|cupcake|kladd|dammsugare|chokladboll/i,/ben & jerry|glass|pint|shortie|mcflurry|sundae/i),
  S('bullar','Bullar & bakverk','🥐',/bulle|bullar|croissant|kanel|kardemumma|semla|donut|munk|churros|\bbuns?\b|scones?|fralla|frallor|pain au|wienerbröd|spandauer|swedish fika/i,/cookie/i),
  S('vafflor','Våfflor & crêpes','🧇',/våffl|waffle|crêpe|crepe|pannkak|pancake/i),
  S('godis','Godis & snacks','🍫',/godis|chips|popcorn|snacks|\bkex|bilar|marabou|daim|snickers|twix|nötter|almonds|mandlar|pralin|tryffel/i,/tårta|mcflurry|glass/i)],
 dryck:[
  S('lask','Läsk','🥤',/coca|cola|pepsi|fanta|sprite|läsk|7.?up|zingo|trocadero|dr ?pepper|mountain dew|schweppes|apotekarnes|pommac|mer\b/i),
  S('vatten','Vatten','💧',/vatten\b|water|ramlösa|loka|imsdal|aqua|mineral/i),
  S('kaffe','Kaffe & te','☕',/kaffe|coffee|latte|cappuccino|espresso|americano|macchiato|cortado|flat white|mocha|mocka|frap|\bte\b|\btea\b|chai|iskaffe/i),
  S('juice','Juice & smoothie','🧃',/juice|smoothie|festis|smakis|bravo|proviva|lemonad|saft/i),
  S('shake','Milkshake','🥛',/shake|\blassi\b/i),
  S('energi','Energidryck','⚡',/red bull|monster|nocco|celsius|energi|powerking|burn\b/i,/capri.?sun/i),
  S('ol','Öl & vin','🍺',/(^|\s)öl\b|beer|lager|\bipa\b|cider|\bvin\b|wine|prosecco|cava|clausthaler|alkoholfri|non alcoholic/i)],
 smatt:[
  S('pommes','Pommes','🍟',/pommes|fries|frites|tots|potato|potatis|klyftpotatis|potatismos/i,/^frites sauce/i),
  S('saser','Såser & dipp','🥫',/sås|sauce|dressing|\bdipp?\b|dipp$|majo|mayo|aioli|ketchup|senap|tzatziki|bearnaise|guacamole|salsa|gräddfil|krydda|soja|soy/i,/fries|pommes|edamame|sojaböna/i),
  S('nuggets','Nuggets & wings','🍗',/nugget|wings|vingar|tenders|strips|bits\b|kycklingbitar/i),
  S('brod','Bröd','🫓',/bröd|naan|bread|\bpita\b|focaccia/i),
  S('sallad','Sallad','🥗',/sallad|salad|coleslaw|kimchi|wakame/i),
  S('ost','Ost & friterat','🧀',/cheese|\bost\b|mozzarella|sticks|lökring|onion ring|jalapeñ|jalapen|halloumi/i,/krydda|majo|mayo|\bdipp?\b|sås|sauce/i),
  S('forratter','Förrätter','🥟',/samosa|pakora|vårrull|spring roll|gyoza|edamame|meze|mezze|tapas|bruschetta|antipast|papadam|förrätt/i)],
 barn:[
  S('burgare','Burgare','🍔',/burg|hamburg/i),
  S('nuggets','Nuggets','🍗',/nugget|strips|chicken|kyckling|bits/i),
  S('pizza','Pizza','🍕',/pizz/i),
  S('pannkakor','Pannkakor','🥞',/pannkak|pancake/i)],
};
// Underkategorier för en rätt i en flik.
export function subcatsFor(item,course){
 const list=SUBCATS[course];if(!list)return [];
 const name=String(item.name||''),both=`${name} ${item.category||''}`;
 return list.filter(s=>{const t=CATEGORY.has(s.key)?both:name;return s.re.test(t)&&!(s.not&&s.not.test(t));}).map(s=>s.key);
}
