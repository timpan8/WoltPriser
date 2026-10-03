# Återkommande avläsning

## Automatiskt (GitHub Actions)

Arbetsflödet `Prisavläsning` (`.github/workflows/scrape.yml`) körs 14:07 och 15:07 UTC. `--if-due` gör att bara den första körningen efter kl. 16 svensk tid läser av, så schemat fungerar både sommar- och vintertid och tål att GitHub startar sent.

1. `npm test`.
2. `node scripts/scrape.mjs --if-due` hämtar listan över alla restauranger som levererar till positionen (`discoverWolt`, sparas i `data/discovered.json`), lägger till dina restauranger från `data/venues.json` och hämtar varje meny via `lib/sources/wolt.mjs`, två restauranger åt gången med paus mellan anropen. Med flera hundra restauranger tar det 10–15 minuter. `SCRAPE_DISCOVER=0` läser bara dina restauranger. Restauranger utan `url` söks upp med exakt namn; utan entydig träff hoppas de över och rapporteras.
3. Rimlighetskontroll per restaurang: tom meny, eller mer än 30 % färre rätter än förra avläsningen, ger ett nytt försök efter 5 s och annars fel. Om kampanjerna inte går att läsa räknas restaurangen som misslyckad, så att ett rabatterat pris aldrig sparas som ordinarie. Misslyckade restauranger behåller sina gamla data. Inga priser uppskattas.
4. Lyckade avläsningar sparas med samma kod som importformuläret (`lib/store.mjs`): `history.json`, `images.json` och `venues.json`.
   Därefter läses Uber Eats för samma restauranger (`lib/sources/ubereats.mjs`), två åt gången, med samma rimlighetskontroll. Restauranger utan känd Uber Eats-länk söks upp med namnet (högst 80 per körning, se `README.md`, Uber Eats). Priserna sparas i `data/ubereats.json` och länkarna i `data/ubereats-links.json`. Fel på Uber Eats stoppar inte Wolt-avläsningen. Blockerar Uber Eats (HTTP 403) avbryts Uber Eats-delen direkt; se Uber Eats i webbläsaren nedan.
5. Ändrade prisfiler committas till main och `pages.yml` startas (en push från GitHub Actions startar inte andra arbetsflöden av sig själv).
6. Körningens sammanfattning visar antal lästa restauranger, fel, varningar (t.ex. inga bilder, eller Wolt+-priser som saknas eftersom skrapan inte är inloggad) och ovanligt låga priser (minst 7 tidigare mätdagar). Om ingen meny kunde läsas misslyckas körningen och GitHub mejlar.

Manuell körning: Actions → Prisavläsning → Run workflow (läser av direkt). Pull requests som ändrar insamlingen gör en provkörning mot tre av dina restauranger och två upptäckta, på Wolt och Uber Eats (med sökning för de som saknar länk), utan att spara. Med `--strict` blir PR:en röd om någon restaurang misslyckas.

Inställningar (Settings → Secrets and variables → Actions → Variables): `WOLT_LAT` och `WOLT_LON` för din leveransadress. De styr både vilka restauranger som läses och vilka kampanjer som gäller; utan dem används Årsta (postnummer 120 53). Ange ungefärliga koordinater (till exempel kvartersnivå); variablerna är inte publika.

## Google-betyg (valfritt, egen nyckel)

Med hemligheten `GOOGLE_PLACES_KEY` hämtar avläsningen restaurangernas betyg på Google (`lib/sources/google.mjs`) och sparar dem i `data/google.json`. Sidan visar dem som *Google ★ 4,3 (812)* med länk till Google Maps, i jämförelsen och i restaurangvyn. Utan nyckel hoppas steget över.

1. Gå till <https://console.cloud.google.com/>, skapa ett projekt (t.ex. *WoltPriser*) och lägg in ett betalkort under **Billing**. Det krävs även för gratiskvoten.
2. **APIs & Services → Library**: sök på *Places API (New)* och klicka **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Öppna nyckeln och välj under **API restrictions** *Restrict key* → *Places API (New)*. Under **Application restrictions** väljer du *None*, eftersom nyckeln bara används från GitHub Actions och aldrig hamnar på sidan.
4. Rekommenderas: **Billing → Budgets & alerts**, en budget på t.ex. 10 kr som mejlar dig om något oväntat drar pengar. Under **APIs & Services → Places API (New) → Quotas** kan du dessutom sätta ett tak per dag, t.ex. 100 anrop.
5. I GitHub: **Settings → Secrets and variables → Actions → Secrets → New repository secret**, namn `GOOGLE_PLACES_KEY`, värdet är nyckeln.

Första gången söks varje restaurang upp på Google med namn och adress från Wolt. Träffen måste ha samma namn och ligga inom 1 km från Wolts position. Plats-id:t sparas och betyget uppdateras därefter med ett direktanrop högst en gång i veckan. Restauranger som inte hittas provas igen efter 30 dagar. Högst 60 anrop per körning (`GOOGLE_LIMIT`). Med cirka 100 restauranger blir det runt 450 anrop i månaden, vilket ryms i Googles gratiskvot. Fel på nyckeln (HTTP 400/403) stoppar Google-steget men aldrig prisavläsningen, och syns i körningens sammanfattning.

Googles villkor för Places API tillåter i princip inte att betyg lagras, bara plats-id:t. Att spara dem är ditt val, och Google skulle i värsta fall kunna stänga av nyckeln.

## Lokalt

```
npm run scrape -- --dry-run            # provkörning, sparar inget
npm run scrape -- --only=ellora        # en restaurang
npm run scrape                         # läs av och spara i data/
```

Lokal reserv om GitHub blockeras: `scripts/scrape-local.ps1` hämtar senaste main, läser av och pushar. Schemalägg i Windows:

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\src\WoltPriser\scripts\scrape-local.ps1" -IfDue'
$t = New-ScheduledTaskTrigger -Daily -At 16:15
Register-ScheduledTask -TaskName 'WoltPriser' -Action $a -Trigger $t -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
```

Med `-IfDue` gör den lokala körningen inget om GitHub redan har läst av i dag.

## Dina priser (Codex, inloggad webbläsare)

Rutinen nedan läser menyerna i din inloggade webbläsare och ger därför dina priser, inklusive Wolt+. Schemalägg den i Codex efter GitHubs avläsning, till exempel varje dag kl. 16:30 (en gång i veckan räcker också: dina priser används i upp till 7 dagar). Den ersätter det gamla dagliga Codex-schemat kl. 16:00, som ska stängas av. Dina priser sparas i `data/member.json`, inte i grunddatan (se `README.md`, Dina priser).

Samma rutin är också manuell reserv om API:t ändras eller blockeras. Importera då med `{snapshots: collected}` utan `mine`, så hamnar läsningen i grunddatan.

1. Arbeta i detta repo. Läs `data/venues.json`, `scripts/extract-menu.js` och detta dokument. Kontrollera att inga andra ändringar pågår. Hämta ändringar med fast-forward om checkout är ren.
2. Använd det godkända webbläsarverktyget och den inloggade Wolt-webbläsaren. Högst tre nya restaurangflikar samtidigt. Återanvänd dem i batcher. Ladda flikarna parallellt, gör sedan läsningen parallellt med `Promise.allSettled`. Inspektera och rapportera varje fel.
   Restauranger i `data/venues.json` som saknar `url` har lagts till med namn från kvitton. Sök upp dem med Wolts sökfält i samma webbläsare och öppna träffen vars namn stämmer exakt (skiftläge spelar ingen roll). Läs menyn som vanligt; importen kopplar restaurangens länk till namnet. Om ingen entydig träff finns eller restaurangen inte levererar till adressen: hoppa över den och rapportera det.
3. Vänta på att menykorten faktiskt finns i DOM. Använd exakt den skrivskyddade funktionen i `scripts/extract-menu.js` med `tab.playwright.evaluate`. Funktionsresultaten samlas i en JavaScript-array i webbläsarverktygets session. Skriv bara antal och kort status till chatten. Läs aldrig sessionsdata, cookies eller adresser. Orderhistorik läses inte i den schemalagda körningen; kvitton läses bara när användaren uttryckligen ber om det (se `README.md`, Egna köp). Logga inte in automatiskt om sessionen har löpt ut; rapportera att användaren behöver öppna Wolt igen.
4. Jämför antal artiklar med senaste avläsningen (fältet `items` på restaurangens sista rad i `readings` i `data/history.json`). Vid tom meny eller minskning med mer än 30 %: kontrollera om sidan är ofullständigt laddad, läs om en gång och markera restaurangen som misslyckad om felet består. Behåll gamla data. Kontrollera minst en kampanjrätts medlemsvillkor när sådana finns. Inga priser får uppskattas. Rapportera varje restaurang där inga rätter fick fältet `image` (det tyder på att bildernas DOM har ändrats eller att sidan inte laddat klart); avläsningen sparas ändå.
5. Starta `node scripts/server.mjs` om 127.0.0.1:4173 inte redan kör rätt app. Öppna importformuläret i en tillfällig flik. Fyll fältet `Menydata (JSON)` med `JSON.stringify({mine: true, snapshots: collected})` (dina priser; utan `mine` som reserv för grunddatan) från samma JavaScript-session via webbläsarens fill/paste-API och klicka Spara avläsning. Verifiera kvittensen och inspektera sedan den sparade filen med filverktyg. Detta undviker att menydatan måste passera genom chatttext.
6. Foodora: för varje restaurang i `data/venues.json` som har fältet `foodora`, öppna länken (högst tre flikar samtidigt), vänta på menykorten (`[data-testid="menu-product"]`) och kör den skrivskyddade funktionen i `scripts/extract-foodora.js`. Lägg till `wolt` (restaurangens Wolt-länk) i varje resultat och importera alla med `JSON.stringify({foodora: collected})` i samma formulär. Läs aldrig adress, varukorg eller konto. Om en sida inte går att läsa: rapportera restaurangen och behåll gamla Foodora-priser.
7. Kör `npm test`. Spara bara de nya prisfilerna (`data/member.json`, `data/images.json` och vid Foodora `data/foodora.json`; som reserv även `data/history.json` och `data/venues.json`) i en commit och push till main i timpan8/WoltPriser. Verifiera GitHub Pages-körningen; en push ensam bevisar inte publicering. Alla insamlingsfel ska anges tydligt. Om ingen giltig meny kunde läsas: gör ingen data-commit.
8. Stäng bara de tillfälliga restaurang- och importflikar som skapades för körningen. Låt användarens flikar vara kvar. Var tyst vid normala lyckade uppdateringar; meddela bara ovanligt låga priser enligt minst 7 tidigare mätdagar, fel som hindrar uppdateringen eller behov av användaråtgärd.

## Restauranger som inte finns på Wolt (manuellt)

Görs vid behov, inte i den dagliga rutinen. Öppna Foodoras lista över restauranger som levererar till Årsta, jämför namnen med `data/venues.json` och `data/discovered.json` och läs bara de som inte finns på Wolt med `scripts/extract-foodora.js` (en flik, en restaurang i taget). Lägg inte till `wolt`. Spara resultaten som `{ "foodora": [...] }` och kör `node scripts/import-compare.mjs <fil>`. Samma regler som ovan: läs aldrig adress, varukorg, konto eller kakor, och avbryt vid robotkontroll eller blockering (försök inte runt den).

## Uber Eats i webbläsaren (reserv)

Uber Eats blockerar i dag anrop från GitHubs nätverk (HTTP 403, provkörning 2026-10-03). Då avbryter den dagliga körningen Uber Eats efter första blockeringen och sammanfattningen visar "Uber Eats blockerar läsningen härifrån". Så länge det står där läses Uber Eats i stället här, i samma Codex-rutin som Dina priser, efter steg 6. En gång i veckan räcker.

1. Kör `node scripts/ubereats-targets.mjs` i repot. Utskriften är en JSON-lista med restauranger (Wolt-länk, namn och känd Uber Eats-länk).
2. Öppna en tillfällig flik med `https://www.ubereats.com/se` i den inloggade webbläsaren. Kontrollera bara att leveransadressen som visas är Årsta; ändra den inte och läs den inte i övrigt. Om sidan visar inloggning eller robotkontroll: rapportera det och avbryt.
3. Kör den skrivskyddade funktionen i `scripts/extract-ubereats.js` med `tab.playwright.evaluate`, med listan som argument, i batcher om högst 40 restauranger. Samla resultaten i en JavaScript-array i webbläsarverktygets session. Skriv bara antal och fel till chatten.
4. Importera i importformuläret (som i steg 5) med `JSON.stringify({ubereatsStores: collected})`, en batch i taget om formuläret blir för stort. Kvittensen visar antal sparade och misslyckade restauranger.
5. Spara `data/ubereats.json` och `data/ubereats-links.json` i samma commit som övriga prisfiler (steg 7).

Kvitton läses bara när användaren uttryckligen ber om det (se `README.md`, Egna köp).

GitHub Pages visar senaste sparade avläsning och varnar när den är äldre än 30 timmar.
