# WoltPriser

En svensk, mobilanpassad översikt över menypriser från utvalda restauranger på Wolt. Historiken börjar med den första faktiska avläsningen; inga tidigare priser konstrueras.

## Användning

Sidan finns på https://timpan8.github.io/WoltPriser/.

Rätterna delas in i flikarna Mat, Frukost, Fika & dessert, Dryck och Smått & tillbehör utifrån restaurangens menykategori (och för drycker även rättens namn). I varje flik visas erbjudandena först: ovanligt billigt, sedan kampanj, sedan nytt lägsta eller sänkt pris, och inom varje nivå störst rabatt först. Filtren har sök, restaurang, ett reglage för maxpris med prisfördelning och snabbval, sortering och valet att räkna med avgifter. Standard är inget pristak, och fisk/skaldjur döljs när de nämns i menytexten. Valen sparas i webbläsaren till nästa besök, utom sökordet. Såser och kryddor hamnar under Smått & tillbehör. Wolt+ kan slås av och på. Filter är hjälpmedel, inte en allergikontroll. Tillgänglighet på rättnivå är inte ett löfte om att restaurangen kan leverera just nu.

## Insamling

Den första insamlingen görs i den vanliga inloggade webbläsaren med Codex webbläsarverktyg. Tre restaurangflikar laddas parallellt och återanvänds. `scripts/extract-menu.js` läser menykortens DOM i ett anrop per restaurang. Inga dolda API:er, cookies, orderdetaljer eller leveransadresser samlas in. Alla laddade menykort inkluderas, även dyrare rätter och sådant som senare filtreras bort i gränssnittet. Anpassade tillval och obligatoriska val inne i varje rätt är inte prissatta i version 1.

Restauranglistan finns i `data/venues.json`. En restaurang kan läggas till med bara namn; insamlingen söker då upp den på Wolt och importen fyller i länken. Importformuläret (se `AUTOMATION.md`) tar emot `{ "snapshots": [...] }` via webbläsaren. Det validerar och sparar menydata lokalt i `data/history.json`. Samma restaurang och tidpunkt importeras endast en gång. Ett fel eller en tom meny får aldrig ersätta gamla data eller bli pris 0.

Belopp lagras som heltal i ören och tidpunkter i UTC. Historiken identifierar rätter med restauranglänk + Wolt-rätt-ID. När Wolt skapar ett nytt ID får rätten ny historik. Dubbletter mellan Populärt och menyn tas bort, medan olika ID:n behålls. Varje sparad avläsning bevaras.

`data/history.json` sparas kompakt så att filen inte växer med hela menyn varje dag. `readings` har en rad per avläsning: restaurang, tidpunkt och antal rätter. `items` har en ändringslogg per rätt. En ny post skrivs bara när pris, text, Wolt+ eller tillgänglighet ändrats, eller när rätten försvunnit från menyn. Varje avläsning kan återskapas exakt ur loggen. Sidan räknar ut prishistoriken en gång när den laddas, inte vid varje filterändring.

## Bilder

`scripts/extract-menu.js` sparar rättens bildlänk i fältet `image` (Wolts `src` utan storleksparametrar). Bara https-länkar på `imageproxy.wolt.com` godkänns. Bilderna kopieras inte till repot; sidan visar dem direkt från Wolt i liten storlek (`?w=300`, `?w=600` för skärmar med hög upplösning). Senaste bild per restaurang och rätt-ID sparas i `data/images.json`, som importen uppdaterar. Bildlänken ingår inte i ändringsloggen i `data/history.json`, så en ny bild räknas inte som en ändring av rätten. Rätter utan bild, eller där bilden inte laddar, får en neutral platshållare.

## Egna köp

`data/receipts.json` innehåller priser från egna Wolt-kvitton och visas som egna punkter i prishistoriken. Kvittona läses bara när användaren ber om det, med `scripts/extract-receipt.js` på en öppen kvittosida. Det som sparas är restaurang, datum (utan klockslag), Wolt-rätt-ID, rättens namn och pris. Ordernummer, adress, betalsätt och totalsummor sparas inte. Avgifter sparas bara som summa per order i `data/fees.json` (se Avgifter nedan). Endast levererade ordrar tas med.

Priset är vad rätten kostade efter rabatt, utan tillval och avgifter. Wolt visar rabatten som en summa för hela ordern. Om den är en jämn procentsats av en enda rätt eller av hela ordern räknas priset exakt; annars fördelas rabatten proportionellt och priset märks som uppskattat. Kvittopunkter matchas mot menyn med restaurangnamn och Wolt-rätt-ID, och räknas inte in i märkningarna nedan. Kvitton importeras via samma importformulär som menyer, med `{ "receipts": [...] }`.

Fliken **Mina rätter** visar dina favoriträtter, alltså rätter du köpt minst två gånger, som rätter och inte som en viss restaurangs rätt. Köp med liknande namn från olika restauranger räknas som samma rätt, till exempel "Chicken Tikka Butter Masala" och "Tikka Masala Chicken". Varje kort visar var rätten är billigast just nu bland alla bevakade restauranger. Tryck för att jämföra alla alternativ. Matchningen (`lib/dishes.mjs`) väger rättens ord efter hur ovanliga de är på menyerna och kräver samma protein. Kortare namn, till exempel en mindre storlek, visas som annan variant och jämförs inte med vad du brukar betala. Prisgräns och fiskfilter gäller inte i fliken. Alla vanliga kort visar också hur många gånger rätten köpts och vad du brukar betala.

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

Push till main kör tester och publicerar den statiska sidan med GitHub Pages. GitHub hämtar inte Wolt-menyer i denna version. Prisinsamlingen schemaläggs separat i Codex och kräver att datorn, appen och den anslutna inloggade webbläsaren är tillgängliga. Se `AUTOMATION.md`. Publicerade JSON-filer innehåller endast menydetaljer och avläsningstider.
