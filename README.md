# WoltPriser

En svensk, mobilanpassad översikt över menypriser från utvalda restauranger på Wolt. Historiken börjar med den första faktiska avläsningen; inga tidigare priser konstrueras.

## Användning

Sidan finns på https://timpan8.github.io/WoltPriser/.

Rätterna delas in i flikarna Mat, Frukost, Fika & dessert, Dryck och Smått & tillbehör utifrån restaurangens menykategori (och för drycker även rättens namn). I varje flik visas erbjudandena först: ovanligt billigt, sedan kampanj, sedan nytt lägsta eller sänkt pris, och inom varje nivå störst rabatt först. Standardfilter: under 160 kr och fisk/skaldjur döljs när de nämns i menytext. Wolt+ kan slås av och på. Filter är hjälpmedel, inte en allergikontroll. Tillgänglighet på rättnivå är inte ett löfte om att restaurangen kan leverera just nu.

## Insamling

Den första insamlingen görs i den vanliga inloggade webbläsaren med Codex webbläsarverktyg. Tre restaurangflikar laddas parallellt och återanvänds. `scripts/extract-menu.js` läser menykortens DOM i ett anrop per restaurang. Inga dolda API:er, cookies, orderdetaljer eller leveransadresser samlas in. Alla laddade menykort inkluderas, även dyrare rätter och sådant som senare filtreras bort i gränssnittet. Anpassade tillval och obligatoriska val inne i varje rätt är inte prissatta i version 1.

Restauranglistan finns i `data/venues.json`. En restaurang kan läggas till med bara namn; insamlingen söker då upp den på Wolt och importen fyller i länken. Importformuläret (se `AUTOMATION.md`) tar emot `{ "snapshots": [...] }` via webbläsaren. Det validerar och sparar menydata lokalt i `data/history.json`. Samma restaurang och tidpunkt importeras endast en gång. Ett fel eller en tom meny får aldrig ersätta gamla data eller bli pris 0.

Belopp lagras som heltal i ören och tidpunkter i UTC. Historiken identifierar rätter med restauranglänk + Wolt-rätt-ID. När Wolt skapar ett nytt ID får rätten ny historik. Dubbletter mellan Populärt och menyn tas bort, medan olika ID:n behålls. Varje sparad avläsning bevaras.

`data/history.json` sparas kompakt så att filen inte växer med hela menyn varje dag. `readings` har en rad per avläsning: restaurang, tidpunkt och antal rätter. `items` har en ändringslogg per rätt. En ny post skrivs bara när pris, text, Wolt+ eller tillgänglighet ändrats, eller när rätten försvunnit från menyn. Varje avläsning kan återskapas exakt ur loggen. Sidan räknar ut prishistoriken en gång när den laddas, inte vid varje filterändring.

## Bilder

`scripts/extract-menu.js` sparar rättens bildlänk i fältet `image` (Wolts `src` utan storleksparametrar). Bara https-länkar på `imageproxy.wolt.com` godkänns. Bilderna kopieras inte till repot; sidan visar dem direkt från Wolt i liten storlek (`?w=300`, `?w=600` för skärmar med hög upplösning). Senaste bild per restaurang och rätt-ID sparas i `data/images.json`, som importen uppdaterar. Bildlänken ingår inte i ändringsloggen i `data/history.json`, så en ny bild räknas inte som en ändring av rätten. Rätter utan bild, eller där bilden inte laddar, får en neutral platshållare.

## Egna köp

`data/receipts.json` innehåller priser från egna Wolt-kvitton och visas som egna punkter i prishistoriken. Kvittona läses bara när användaren ber om det, med `scripts/extract-receipt.js` på en öppen kvittosida. Det som sparas är restaurang, datum (utan klockslag), Wolt-rätt-ID, rättens namn och pris. Ordernummer, adress, betalsätt, avgifter och totalsummor sparas inte. Endast levererade ordrar tas med.

Priset är vad rätten kostade efter rabatt, utan tillval och avgifter. Wolt visar rabatten som en summa för hela ordern. Om den är en jämn procentsats av en enda rätt eller av hela ordern räknas priset exakt; annars fördelas rabatten proportionellt och priset märks som uppskattat. Kvittopunkter matchas mot menyn med restaurangnamn och Wolt-rätt-ID, och räknas inte in i märkningarna nedan. Kvitton importeras via samma importformulär som menyer, med `{ "receipts": [...] }`.

Fliken **Mina rätter** visar rätter som köpts minst två gånger, oavsett prisgräns och fiskfilter. Erbjudanden och rätter som just nu kostar mindre än medianen av vad du har betalat visas först. Alla kort visar hur många gånger rätten köpts och vad du brukar betala. Ett kvitto kopplas till en rätt med Wolt-rätt-ID, eller med exakt samma namn hos samma restaurang om Wolt har bytt ID.

## Prisjämförelse

- Kampanj: aktuellt pris under det ordinarie pris som Wolt visar. Detta är inte bevis på ett historiskt fynd.
- Ovanligt lågt: minst 20 % under medianen av sista avläsningen per tidigare dag under senaste 30 dagar, minst 7 tidigare dagar krävs.
- Nytt lägsta: strikt lägre än tidigare observerade priser för samma rätt och medlemsval.
- Wolt+-avstängning använder ordinarie pris när det lägre priset uttryckligen kräver medlemskap.
- Avgifter, leverans, kuponger på hela varukorgen, minsta ordervärde och mängdvillkor ingår inte i menypriset. Kontrollera alltid totalsumman hos Wolt.

## Publicering och automation

Push till main kör tester och publicerar den statiska sidan med GitHub Pages. GitHub hämtar inte Wolt-menyer i denna version. Prisinsamlingen schemaläggs separat i Codex och kräver att datorn, appen och den anslutna inloggade webbläsaren är tillgängliga. Se `AUTOMATION.md`. Publicerade JSON-filer innehåller endast menydetaljer och avläsningstider.
