# WoltPriser

En svensk, mobilanpassad översikt över menypriser från utvalda restauranger på Wolt. Historiken börjar med den första faktiska avläsningen; inga tidigare priser konstrueras.

## Användning

Sidan finns på https://timpan8.github.io/WoltPriser/.

Standardfilter: under 160 kr, fisk/skaldjur döljs när de nämns i menytext, drycker och tillbehör döljs med textbaserade regler. Wolt+ kan slås av och på. Filter är hjälpmedel, inte en allergikontroll. Tillgänglighet på rättnivå är inte ett löfte om att restaurangen kan leverera just nu.

## Insamling

Den första insamlingen görs i den vanliga inloggade webbläsaren med Codex webbläsarverktyg. Tre restaurangflikar laddas parallellt och återanvänds. `scripts/extract-menu.js` läser menykortens DOM i ett anrop per restaurang. Inga dolda API:er, cookies, orderdetaljer eller leveransadresser samlas in. Alla laddade menykort inkluderas, även dyrare rätter och sådant som senare filtreras bort i gränssnittet. Anpassade tillval och obligatoriska val inne i varje rätt är inte prissatta i version 1.

Restauranglistan finns i `data/venues.json`. Importformuläret (se `AUTOMATION.md`) tar emot `{ "snapshots": [...] }` via webbläsaren. Det validerar och sparar menydata lokalt i `data/history.json`. Samma restaurang och tidpunkt importeras endast en gång. Ett fel eller en tom meny får aldrig ersätta gamla data eller bli pris 0.

Belopp lagras som heltal i ören och tidpunkter i UTC. Historiken identifierar rätter med restauranglänk + Wolt-rätt-ID. När Wolt skapar ett nytt ID får rätten ny historik. Dubbletter mellan Populärt och menyn tas bort, medan olika ID:n behålls. Varje sparad avläsning bevaras.

`data/history.json` sparas kompakt så att filen inte växer med hela menyn varje dag. `readings` har en rad per avläsning: restaurang, tidpunkt och antal rätter. `items` har en ändringslogg per rätt. En ny post skrivs bara när pris, text, Wolt+ eller tillgänglighet ändrats, eller när rätten försvunnit från menyn. Varje avläsning kan återskapas exakt ur loggen. Sidan räknar ut prishistoriken en gång när den laddas, inte vid varje filterändring.

## Egna köp

`data/receipts.json` innehåller priser från egna Wolt-kvitton och visas som egna punkter i prishistoriken. Kvittona läses bara när användaren ber om det, med `scripts/extract-receipt.js` på en öppen kvittosida. Det som sparas är restaurang, datum (utan klockslag), Wolt-rätt-ID, rättens namn och pris. Ordernummer, adress, betalsätt, avgifter och totalsummor sparas inte. Endast levererade ordrar tas med.

Priset är vad rätten kostade efter rabatt, utan tillval och avgifter. Wolt visar rabatten som en summa för hela ordern. Om den är en jämn procentsats av en enda rätt eller av hela ordern räknas priset exakt; annars fördelas rabatten proportionellt och priset märks som uppskattat. Kvittopunkter matchas mot menyn med restaurangnamn och Wolt-rätt-ID, och räknas inte in i märkningarna nedan. Kvitton importeras via samma importformulär som menyer, med `{ "receipts": [...] }`.

## Prisjämförelse

- Kampanj: aktuellt pris under det ordinarie pris som Wolt visar. Detta är inte bevis på ett historiskt fynd.
- Ovanligt lågt: minst 20 % under medianen av sista avläsningen per tidigare dag under senaste 30 dagar, minst 7 tidigare dagar krävs.
- Nytt lägsta: strikt lägre än tidigare observerade priser för samma rätt och medlemsval.
- Wolt+-avstängning använder ordinarie pris när det lägre priset uttryckligen kräver medlemskap.
- Avgifter, leverans, kuponger på hela varukorgen, minsta ordervärde och mängdvillkor ingår inte i menypriset. Kontrollera alltid totalsumman hos Wolt.

## Publicering och automation

Push till main kör tester och publicerar den statiska sidan med GitHub Pages. GitHub hämtar inte Wolt-menyer i denna version. Prisinsamlingen schemaläggs separat i Codex och kräver att datorn, appen och den anslutna inloggade webbläsaren är tillgängliga. Se `AUTOMATION.md`. Publicerade JSON-filer innehåller endast menydetaljer och avläsningstider.
