# WoltPriser

En svensk, mobilanpassad översikt över menypriser från utvalda restauranger på Wolt. Historiken börjar med den första faktiska avläsningen; inga tidigare priser konstrueras.

## Användning

Sidan finns på https://timpan8.github.io/WoltPriser/.

Rätterna delas in i flikarna Mat, Frukost & mackor, Fika & dessert, Dryck, Tillbehör (inklusive såser och dipp) och Barn utifrån restaurangens menykategori. I allmänna kategorier (Kampanj, Bundles, Något extra …) avgör rättens namn och pris: "Räksmörgås" blir Frukost & mackor, "Tiramisu" Fika, en dipp för 10 kr Tillbehör. Måltider med dryck eller pommes ("inkl. dryck", "+ pommes", "-mål") räknas som mat, "Chicken Sandwich" hos en hamburgerkedja är mat, och barnmenyer och minimål hamnar under Barn. Bestick och påsar visas inte. Samma rätt till samma pris hos flera restauranger (t.ex. kedjor) visas som ett kort med "Samma pris hos N restauranger till"; dina restauranger och de med högst betyg visas först. Under flikarna finns snabbfilter med ikon för de vanligaste sorterna i varje flik (t.ex. 🍕 Pizza, 🍛 Indiskt, 🍔 Burgare under Mat, 🥤 Läsk, ☕ Kaffe & te under Dryck, 🍦 Glass under Fika, 🍟 Pommes, 🥫 Såser & dipp under Tillbehör), definierade i `lib/subcats.mjs`. De matchas mot rättens namn, och för kök som pizza och indiskt även mot menykategorin. Bara snabbfilter med minst 3 rätter visas. **Bevaka och beställ.** Stjärnan på ett kort bevakar rätten; bevakade rätter samlas i fliken ★ Bevakade och visas först i raden *Billigare sedan igår* (rätter vars pris sjunkit minst 3 kr sedan förra dagens avläsning). *+ Lägg till* lägger rätten i en beställning (knappen nere på sidan) som räknar ihop delsumma, uppskattade avgifter, hur mycket som saknas till restaurangens minsta ordervärde och vad samma rätter kostar på Foodora och Uber Eats. Bevakningar och beställningen sparas bara i webbläsaren.

**Restauranger.** Restaurangnamnet på ett kort öppnar restaurangvyn: alla rätter där, med betyg, öppettider och minsta ordervärde överst. Korten visar *Öppet till 22:00*, *Stänger 21:40 (om 25 min)* eller *Stängt · öppnar 11:00* utifrån Wolts leveranstider (`data/venueinfo.json`, läses i den dagliga avläsningen), Kort från restauranger som har stängt just nu tonas röda, med gråare bild och en röd *Stängt*-etikett, och samma sak gäller raderna i jämförelsen, där öppettiden också står. *Öppet nu* tar bort stängda restauranger. Filtren är knappar som slås av och på, i grupperna Visa (bara erbjudanden, mina restauranger, öppet nu), Priser (med avgifter, Wolt+, foodora pro), Billigare på (Foodora, Uber Eats; väljs båda visas rätter som är billigare i någon av dem) och Betyg och mat (Wolt-betyg 6+ till 9+, Google-betyg 3+ till 4,5+ med samma nivåer som färgerna, och All mat / Utan fisk & skaldjur / Vegetariskt / Veganskt, där utan fisk är standard). Kosten läses ur menytexten och är en hjälp, inte en garanti. Valda filter sparas i webbadressen.

**Sortering.** Väljaren *Sortera* har Bästa erbjudanden, Mest för pengarna, Lägst pris, Bäst betyg (snittet av Wolt och Google), Bäst Google-betyg, Bäst Wolt-betyg, Restaurang A–Ö och, under Dryck, Lägst literpris. Betygen räknas på tioskala (Googles 1–5 gånger 2); restauranger utan betyg hamnar sist. *Mest för pengarna* tar betygssnittet minus 2 poäng per fördubbling av priset jämfört med medianpriset för liknande rätter (samma snabbfilter, t.ex. pizzor mot pizzor, annars samma flik). En rätt till halva medianpriset får alltså 2 poäng extra, en dubbelt så dyr 2 poäng avdrag. Rätter vars ordinarie pris är under halva medianen räknas som mindre portioner (en sushibit, en liten burgare) och får ingen prisbonus, men ett kampanjpris på en vanlig rätt räknas fullt. Rätter under 15 kr hamnar sist.

**Bilder.** Samma bild hos restauranger av olika märken är Wolts exempelbilder (bildbank, t.ex. en läskburk eller en generisk sallad), inte restaurangens eget foto, och märks *Exempelbild* på korten och *Exempel* i jämförelsen. Kedjor med samma namn räknas inte.

**Länkar och mörkt läge.** Flik och filter står i webbadressen (t.ex. `#mat?q=pizza&max=150&sub=pizza`), så en vy kan sparas som bokmärke eller delas. Sidan följer enhetens mörka läge.

Sökningen gäller alla flikar: under sökrutan visas antal träffar i övriga flikar, och har en annan flik minst fem gånger så många träffar i rättens eller restaurangens namn visas den direkt. Träffar i namnet visas före träffar i beskrivningen. Rätter med ordinarie pris under 15 kr och sänkningar under 3 kr räknas inte som erbjudanden, och erbjudandena sorteras på hur många kronor man sparar. På mobilen är filtren ihopfällda under sökrutan. Fler rätter laddas automatiskt när man scrollar mot slutet av listan. Under Dryck finns ett storleksfilter (under 50 cl, 50–99 cl, 1 liter+) och sortering på literpris; volymen läses ur dryckens namn ("33 cl", "1,5 L", "6 x 33 cl"). I varje flik visas erbjudandena först: ovanligt billigt, sedan kampanj, sedan nytt lägsta eller sänkt pris, och inom varje nivå störst rabatt först. Filtren har sök, restaurang, ett reglage för maxpris med prisfördelning och snabbval, sortering och valet att räkna med avgifter. Standard är inget pristak, och fisk/skaldjur döljs när de nämns i menytexten. Valen sparas i webbläsaren till nästa besök, utom sökordet. Wolt+ kan slås av och på. Filter är hjälpmedel, inte en allergikontroll. Tillgänglighet på rättnivå är inte ett löfte om att restaurangen kan leverera just nu.

## Insamling

Insamlingen sker automatiskt med `scripts/scrape.mjs` (se `AUTOMATION.md`). Skriptet hämtar varje restaurangs meny från Wolts öppna JSON-API, samma anrop som wolt.com gör för en besökare som inte är inloggad: `consumer-assortment` ger rätter, kategorier, ordinarie priser, bilder och tillgänglighet, och venue-`dynamic` ger restaurangens aktiva kampanjer. Kampanjpriset räknas fram ur kampanjens regel (t.ex. 30 % på utvalda rätter); vid införandet gav det samma priser, kategorier och texter som DOM-avläsningarna. Ingen inloggning, inga cookies, orderdetaljer eller adresser används; positionen för kampanjer anges med `WOLT_LAT`/`WOLT_LON` (standard: Årsta, postnummer 120 53). Alla rätter i menyn inkluderas, även dyrare rätter och sådant som senare filtreras bort i gränssnittet. Anpassade tillval och obligatoriska val inne i varje rätt är inte prissatta.

Begränsningar: Wolt+-kampanjer visas bara för inloggade medlemmar och kommer därför inte med i den automatiska insamlingen. De kommer i stället från dina egna priser (se nedan). Rätter som Wolt döljer när de är slut kan saknas i en avläsning och markeras då som borta tills de kommer tillbaka.

Wolt är huvudkällan (`lib/sources/wolt.mjs`). Uber Eats läses automatiskt i samma körning som jämförelsepriser (`lib/sources/ubereats.mjs`, se Uber Eats nedan). Foodora skyddas av bot-skyddet PerimeterX och läses därför bara i en vanlig webbläsare. Den gamla webbläsarläsningen (`scripts/extract-menu.js` + importformuläret) finns kvar som manuell reserv.

Rätter som tidigare hade ett Wolt+-pris men nu läses med fullpris räknas upp som varning i körningens sammanfattning, så att det syns om Wolt+-rabatter saknas och inte bara ser ut som prishöjningar.

Skrapan läser alla restauranger som levererar till positionen (`WOLT_LAT`/`WOLT_LON`), inte bara dina. Listan hämtas varje dag från Wolt (samma lista som startsidan visar) och sparas med namn, länk, betyg och kökstyp i `data/discovered.json`. Butiker hoppas över. Går listan inte att hämta läses bara dina restauranger. På sidan finns filtren Mina restauranger och Kök, och restaurangväljaren delas i dina och övriga. Mina rätter jämför med alla restauranger. Betyget (★) visas på korten och i jämförelsen mellan restauranger. Det kommer från restauranglistan och, för dina egna restauranger som inte finns i den, från den dagliga avläsningen (`data/ratings.json`). Med en egen nyckel (`GOOGLE_PLACES_KEY`, se `AUTOMATION.md`) hämtas även restaurangernas Google-betyg till `data/google.json`, uppdaterade en gång i veckan. De visas på korten (Google ★ 4,3) och, med antal omdömen och länk till Google Maps, i jämförelsen och restaurangvyn. Betygen visas som färgade etiketter med skalan utskriven (Wolt 8,2/10, Google 4,3/5). Färgen visar nivån på samma sätt för båda: grön utmärkt (Wolt 9+, Google 4,5+), ljusgrön bra (8+ / 4+), gul okej (7+ / 3,5+) och röd svagt. Förklaringen står bland märkningarna ovanför korten.

Dina restauranger finns i `data/venues.json`; skrapan lägger aldrig till upptäckta restauranger där. En restaurang kan läggas till med bara namn; insamlingen söker då upp den på Wolt och importen fyller i länken. Importformuläret (se `AUTOMATION.md`) tar emot `{ "snapshots": [...] }` via webbläsaren. Det validerar och sparar menydata lokalt i `data/history.json`. Samma restaurang och tidpunkt importeras endast en gång. Ett fel eller en tom meny får aldrig ersätta gamla data eller bli pris 0.

Belopp lagras som heltal i ören och tidpunkter i UTC. Historiken identifierar rätter med restauranglänk + Wolt-rätt-ID. När Wolt skapar ett nytt ID får rätten ny historik. Dubbletter mellan Populärt och menyn tas bort, medan olika ID:n behålls. Varje sparad avläsning bevaras.

`data/history.json` sparas kompakt så att filen inte växer med hela menyn varje dag. `readings` har en rad per avläsning: restaurang, tidpunkt och antal rätter. `items` har en ändringslogg per rätt. En ny post skrivs bara när pris, text, Wolt+ eller tillgänglighet ändrats, eller när rätten försvunnit från menyn. Varje avläsning kan återskapas exakt ur loggen. Sidan räknar ut prishistoriken en gång när den laddas, inte vid varje filterändring.

## Dina priser

`data/history.json` är grunddatan: allas priser som skrapan läser utan inloggning. `data/member.json` har dina priser från din inloggade webbläsare i samma format: Wolt+-kampanjer och annat som bara syns för dig. Codex läser dem med `scripts/extract-menu.js`, och importformuläret sparar dem med `{ "mine": true, "snapshots": [...] }` (se `AUTOMATION.md`). Din inloggning lämnar aldrig datorn.

Vid publiceringen bygger `scripts/build-data.mjs` den publicerade historiken med `lib/member.mjs`: grunddatan, där varje rätt får ditt pris om din senaste läsning av restaurangen är högst 7 dagar gammal, rätten har samma ordinarie pris och ditt pris är lägre. Har restaurangen ändrat det ordinarie priset sedan dess, eller finns en ny allmän kampanj som är billigare, gäller grunddatan. Dina läsningar räknas också som avläsningar i prishistoriken. Den lokala servern visar samma sammanslagna historik. Alla läsningar före den automatiska insamlingen gjordes inloggade och finns därför i båda filerna. Skrapans varning om saknade Wolt+-priser gäller bara rätter där du saknar ett färskt eget pris.

## Bilder

Skrapan (`lib/sources/wolt.mjs`) och den manuella läsningen (`scripts/extract-menu.js`) sparar rättens bildlänk i fältet `image`, utan storleksparametrar. Bara https-länkar på `imageproxy.wolt.com` godkänns. Bilderna kopieras inte till repot; sidan visar dem direkt från Wolt i liten storlek (`?w=300`, `?w=600` för skärmar med hög upplösning). Senaste bild per restaurang och rätt-ID sparas i `data/images.json`, som importen uppdaterar. Bildlänken ingår inte i ändringsloggen i `data/history.json`, så en ny bild räknas inte som en ändring av rätten. Rätter utan bild, eller där bilden inte laddar, får en neutral platshållare.

## Foodora

Samma restauranger läses också på Foodora, så att korten kan visa om rätten är billigare där. `data/venues.json` har fältet `foodora` med restaurangens Foodora-länk; den fylls bara i när restaurangen går att identifiera entydigt (samma namn och område, eller samma meny och priser). `scripts/extract-foodora.js` läser en öppen Foodora-sida på samma skrivskyddade sätt som menyskriptet: rättens namn, kategori, pris, överstruket ordinarie pris, om priset visas som "från" och pris under PRO-DEALS (foodora pro). Importformuläret tar emot `{ "foodora": [...] }` där varje avläsning har `url` (Foodora), `wolt` (Wolt-länken) och `items`. Priserna sparas i `data/foodora.json` som en ändringslogg per rätt.

Foodora har inga gemensamma rätt-ID:n med Wolt. En rätt jämförs bara när namnet är exakt detsamma (utan skiljetecken och versaler); flera rätter med samma namn avgörs av kategorin, annars jämförs de inte. "Från"-priser är grundpriset innan obligatoriska val och märks på kortet. Jämförelsen gäller menypriset: leverans, serviceavgift och medlemskap skiljer sig mellan tjänsterna. Foodora-priser visas i prishistoriken men räknas inte in i märkningarna.

## Restauranger som inte finns på Wolt

Foodora och Uber Eats kan också läsas för restauranger som inte finns på Wolt. En sådan avläsning saknar fältet `wolt` och sparas i `data/foodora.json` respektive `data/ubereats.json` under appens egen länk. Väljaren bredvid Kök styr vilka restauranger som visas: Restauranger på Wolt (standard), Wolt + Foodora/Uber Eats, eller Bara utanför Wolt. Korten märks "Inte på Wolt" och länkar till appen.

- Samma restaurang på både Foodora och Uber Eats slås ihop på namnet (utan skiljetecken, versaler och ortsord som "Stockholm"). Appen med flest rätter ger priset; den andra jämförs på samma sätt som mot Wolt.
- Finns en restaurang med samma namn på Wolt visas den bara som Wolt-restaurang.
- Märkningarna fungerar som för Wolt men bygger på appens egen ändringslogg. Avgifter räknas inte, eftersom avgiftsmodellen bygger på dina Wolt-kvitton.
- Import: `node scripts/import-compare.mjs <fil.json>` med `{ "foodora": [...] }` och/eller `{ "ubereats": [...] }` (samma format som importformuläret). Uber Eats-restauranger utan Wolt-länk kräver en känd Uber Eats-länk; de söks inte upp på namn.

## Uber Eats

Uber Eats läses för alla restauranger som läses på Wolt, både dina och de som levererar till positionen. Länken till Uber Eats-butiken hittas så här:

- Fältet `ubereats` i `data/venues.json` går alltid först (länkar som du lagt in för hand).
- Annars söks restaurangen upp på Uber Eats med namnet från Wolt, med leveransadressen satt till samma position som Wolt-läsningen. Butiken godtas bara om namnet stämmer (utan text inom parentes, ortsuffix efter " - " och ord som "restaurang") och butiken ligger högst 8 km från positionen. Om Uber Eats-namnet har ett extra ord, till exempel en ort, krävs minst två ord i namnet och högst 3 km. Finns flera godtagbara butiker väljs den närmaste.
- Träffar och missar sparas i `data/ubereats-links.json`. En restaurang utan träff söks igen efter 14 dagar. Högst 80 sökningar görs per körning (`UBEREATS_SEARCH_LIMIT`), så de första dagarna fylls listan på successivt.

Menyn hämtas från Uber Eats öppna webb-API (`getStoreV1`, samma anrop som ubereats.com gör utan inloggning): rättens namn, kategori, pris och överstruket ordinarie pris. Slutsålda rätter tas inte med. Priserna sparas i `data/ubereats.json`, i samma format som Foodora. Uber One-priser syns bara för inloggade och kommer inte med. Tom meny, eller mer än 30 % färre rätter än förra gången, räknas som fel och gamla priser behålls. `SCRAPE_UBEREATS=0` stänger av Uber Eats i körningen.

Uber Eats blockerar i dag anrop från GitHubs nätverk (HTTP 403). Den dagliga körningen slutar då efter första försöket, och samma läsning görs i stället i din webbläsare (se `AUTOMATION.md`, Uber Eats i webbläsaren). Valet av butik och rimlighetskontrollen är desamma.

Jämförelsen fungerar som för Foodora. Om inget namn är exakt detsamma görs ett andra försök där text inom parentes och ordet "pizza" tas bort ("Chicken Madras (Stark)", "Capricciosa Pizza"). Det andra försöket gäller bara när träffen är entydig och priset ligger mellan hälften och det dubbla. Då visar kortet Uber Eats-namnet inom citattecken, så att du ser vad som jämförs. Det andra försöket gäller också Foodora.


Jämförelsepriser från Foodora och Uber Eats som är äldre än ett dygn får ett datum (*pris från 3 okt.*), både på Wolt-korten och på restauranger som bara finns i de apparna. Är de äldre än en vecka används de inte i jämförelsen (filtret Billigare på räknar inte med dem). Uber Eats läses i webbläsaren när GitHub blockeras och kan därför bli gammalt.
## Egna köp

`data/receipts.json` innehåller priser från egna Wolt-kvitton och visas som egna punkter i prishistoriken. Kvittona läses bara när användaren ber om det, med `scripts/extract-receipt.js` på en öppen kvittosida. Det som sparas är restaurang, datum (utan klockslag), Wolt-rätt-ID, rättens namn och pris. Ordernummer, adress, betalsätt och totalsummor sparas inte. Avgifter sparas bara som summa per order i `data/fees.json` (se Avgifter nedan). Endast levererade ordrar tas med.

Priset är vad rätten kostade efter rabatt, utan tillval och avgifter. Wolt visar rabatten som en summa för hela ordern. Om den är en jämn procentsats av en enda rätt eller av hela ordern räknas priset exakt; annars fördelas rabatten proportionellt och priset märks som uppskattat. Kvittopunkter matchas mot menyn med restaurangnamn och Wolt-rätt-ID, och räknas inte in i märkningarna nedan. Kvitton importeras via samma importformulär som menyer, med `{ "receipts": [...] }`.

Fliken **Mina rätter** visar dina favoriträtter, alltså rätter du köpt minst två gånger, som rätter och inte som en viss restaurangs rätt. Köp med liknande namn från olika restauranger räknas som samma rätt, till exempel "Chicken Tikka Butter Masala" och "Tikka Masala Chicken". Varje kort visar var rätten är billigast just nu bland alla bevakade restauranger. Tryck för att jämföra alla alternativ. Matchningen (`lib/dishes.mjs`) väger rättens ord efter hur ovanliga de är på menyerna och kräver samma protein. Kortare namn, till exempel en mindre storlek, visas som annan variant och jämförs inte med vad du brukar betala. Prisgräns och fiskfilter gäller inte i fliken. Snabbfiltren (🍽️ Mat, 🥪 Frukost & mackor, 🍰 Fika & dessert, 🥤 Dryck …) håller isär favoriterna efter sort; en favorit hamnar i samma flik som rätten med samma namn på menyerna. Alla vanliga kort visar också hur många gånger rätten köpts och vad du brukar betala.

## Avgifter

Korten visar både menypriset och en uppskattning av vad rätten kostar med avgifter, om den beställs ensam. Wolts serviceavgift är 10 % av rätternas *ordinarie* pris, även när rätten har kampanjpris. Leveransen har kostat 0 kr med Wolt+, och Wolt+ drar av en del av serviceavgiften. `data/fees.json` har en rad per egen order: restaurang, datum, rätternas ordinarie pris och betalda avgifter (öre). Raderna kommer från Wolts kvittomejl: totalbelopp minus rabatt och Wolt+-rabatt, minus rätternas pris i `data/receipts.json`. Ordrar med rabattkod eller uppskattade rättpriser tas inte med.

`lib/fees.mjs` räknar avgiften som andel av ordinarie pris: medianen av de tre senaste ordrarna hos restaurangen, annars medianen av de tio senaste ordrarna totalt. Andelar över 30 % räknas inte, eftersom de tyder på ofullständiga kvitton. Tillägg för liten beställning, tillfälligt höjd leveransavgift och delade avgifter vid flera rätter ingår inte. I Mina rätter väljs det billigaste alternativet med avgifterna inräknade.

## Prisjämförelse

- Kampanj: aktuellt pris under det ordinarie pris som Wolt visar. Detta är inte bevis på ett historiskt fynd.
- Ovanligt lågt: minst 20 % under medianen av sista avläsningen per tidigare dag under senaste 30 dagar, minst 7 tidigare dagar krävs.
- Nytt lägsta: strikt lägre än tidigare observerade priser för samma rätt och medlemsval.
- Wolt+-avstängning använder ordinarie pris när det lägre priset uttryckligen kräver medlemskap.
- Avgifter, leverans, kuponger på hela varukorgen, minsta ordervärde och mängdvillkor ingår inte i menypriset. Kontrollera alltid totalsumman hos Wolt.

## Publicering och automation

Push till main kör tester och publicerar den statiska sidan med GitHub Pages. Vid publiceringen får `style.css`, `app.mjs` och modulerna i `lib/` en versionsparameter per commit (`?v=`). Webbläsaren kan därför inte blanda filer från olika versioner ur cachen. Går skriptet ändå inte att köra visas en uppmaning att ladda om. Arbetsflödet `Prisavläsning` (`.github/workflows/scrape.yml`) läser av menyerna varje dag efter kl. 16 svensk tid, sparar de nya prisfilerna i en commit och startar publiceringen. Om ingen meny kunde läsas misslyckas körningen och GitHub skickar ett mejl; enstaka restauranger som misslyckas listas i körningens sammanfattning och behåller sina gamla data. `scripts/scrape-local.ps1` gör samma sak från en egen dator om GitHub skulle blockeras. Se `AUTOMATION.md`. Publicerade JSON-filer innehåller endast menydetaljer och avläsningstider.
