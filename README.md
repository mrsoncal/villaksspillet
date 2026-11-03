# Villaks – Reisen hjem

Et spillbart 2D top-down-eventyr om den atlantiske villaksens reise fra Mandalselva til havet og hjem igjen. Spillet er laget for barn, ungdom og familier, fungerer med berøring og mus, og krever verken innlogging eller backend.

## Starte lokalt

Krav: Node.js 20 eller nyere.

```bash
npm install
npm run dev
```

Vite viser en lokal adresse, vanligvis `http://localhost:5173`.

## Bygg og kontroll

```bash
npm run check
npm run build
npm run preview
```

Produksjonsfilene legges i `dist/`.

## Spillinnhold

- Fire sammenhengende nivåer: oppvekst i elva, smoltvandring, livet i havet og hjemvandring.
- Felles pek-og-svøm-kontroll for finger og mus, inkludert dra-for-å-styre.
- Myk akselerasjon, fremdriftsbasert styring med minste svingradius for både spill-laks og rovfisk, meshbasert kroppsanimasjon med svingbøy og utholdenhet.
- Egen tilfeldig elvegenerator for nivå 1, 2 og 4: hver spillrunde får et nytt terreng der individuelle steiner vokser kant-i-kant til tette klynger med størst tetthet ved land, noen få store sjøgressområder brer seg hovedsakelig ved stein og strand, og elverovdyrene får nye terrengtilpassede patruljeruter med aktiv hinderstyring, stabil klyngeretning og automatisk frigjøring dersom fremdriften stopper.
- Langstrakte steiner bruker sammensatte, roterte kollisjonsfelt. Laksens kroppshitboks følger den smale, solide torsoen slik at synlige åpninger faktisk kan brukes. Hvert sjøgresstuft har et eget formtilpasset skjulområde som fisken kan svømme gjennom.
- Når laksen svømmer inn i et skjulområde, blir den delvis gjennomsiktig og en myk, pulserende vignett viser tydelig at rovfisken ikke ser den like godt.
- Skjulområdene har ingen kunstige markeringer i terrenget. Maten plasseres tilfeldig med størst sannsynlighet i sjøgress, har sømløs og svært begrenset lokal drift, og beveger kroppen i ledd. En tett rød kontur følger formen, og laksen gir et kort visuelt «pop» når den spiser.
- Når matmålet nås på nivå 1 og 3, forvandles laksen med lys, partikler og størrelsesovergang til modellen fra neste livsstadium. Mister spilleren alle tre liv, starter reisen på nytt fra nivå 1.
- Utgangene på nivå 1–3 er volumetriske undervannsgløder helt ved enden av området. Hele den spillbare høyrekanten fungerer som overgang når målet er oppfylt, slik at spilleren ikke må treffe et lite usynlig punkt inne i lyset.
- Elvestrømmen går med spilleren på nivå 1 og mot spilleren på nivå 4. Terrengoppsettet er ellers bygget etter de samme reglene.
- Nivå 2 kombinerer matinnsamling og elveterrenget med to mer aggressive rovfisk og et fotorealistisk kraftverksinntak. Inntaket sender pulserende sugestøt gjennom vannet; steiner og sjøgress demper suget, men kontakt med selve risten er umiddelbart dødelig. Rovfiskene planlegger og styrer rutene sine utenom hele kraftverksområdet, og den trygge passasjen markeres av den samme naturlige undervannsgløden som nivå 1.
- Nivå 3 er et eget, betydelig større åpent havbiom uten strand eller steinhindre. Både bredden og dybden er utvidet, mørke dybdesoner avgrenser området, og store felt med dyphavstare gir skjul. Tre anatomisk korrigerte torsker patruljerer som klassiske rovfisk, mens den langt større og raske selen dekker større områder, oppdager laksen på lengre avstand og angriper i korte, kraftige utfall. En tett, 17-leddet rigg holder selens torso stabil mens bakpartiet og bakluffene slår raskt fra side til side. Krillens røde glød beregnes direkte fra den animerte silhuetten og følger derfor kroppen og beina uten å sveve utenfor figuren. Hjemreisen markeres av den samme naturlige undervannsgløden som i de tidligere nivåene.
- Nivå 4 er en egen, nesten dobbelt så lang hjemvandringselv med terreng, sjøgress og motstrøm gjennom hele strekningen. Tre semirealistiske gytebunner er spredt utover den siste delen: stille silt, bløt mudderbunn og ren oksygenrik grus. Bunnfeltene fargetilpasses elva og dekkes av et maskert, bevegelig vannlag som lar lysbrytningen fortsette over dem. Åtte fotorealistiske metallkroker kastes mot tilfeldige punkter fra begge bredder, driver kort i vannet, sveives inn og kastes ut på nytt etter en variabel pause. Snøret er festet direkte i den øverste metallringen, og kroken følger til enhver tid snøreretningen med maksimalt ti graders tilfeldig avvik. Bare selve kroken skader laksen.
- Et felles blågrønt undervannsfilter graderer fisk, steiner, vegetasjon og øvrige spillressurser. Kryssende vannlag, drivende bølgelinjer, pulserende lysfelter og levende fargedybde gjør vannet dynamisk, mens HUD og menyer forblir klare og lettleste.
- Kortvarig beskyttelse etter skade. Mister spilleren alle tre liv, starter hele reisen på nytt fra nivå 1.
- Tre stjerner vurderer den enkelte svømmeturen, men lagres ikke som permanent progresjon og låser ikke opp innhold. Hver ny runde starter som en ny reise fra nivå 1.
- Pausemeny, lyd av/på og responsivt grensesnitt.
- Ingen konto, sporing, annonser eller kjøp.

## Struktur

```text
src/
  App.tsx                 React-flyt, menyer, HUD og lokal lagring
  styles.css              responsiv visuell stil
  types.ts                delte TypeScript-typer
  assets/
    water-depth-v2.png    original, generert undervannstekstur
    salmon-stage-*.png    fire originale livsstadier for spill-laksen
    trout-topdown-v4.png  anatomisk korrigert ørret-sprite sett ovenfra
    river-stone-*-v4.png  tre semirealistiske enkeltsteiner for elvegeneratoren
    river-rock-cluster-*.png  eksisterende steinklynger for elvenivåene
    river-seagrass-*.png  sjøgressklynge for vegetasjon og skjul
    deep-ocean-kelp-v1.png  top-down dyphavstare for nivå 3
    atlantic-cod-topdown-v3.png  anatomisk korrigert torsk sett ovenfra
    harbor-seal-topdown-v1.png  semirealistisk sel sett ovenfra
    spawn-*-v1.png         tre semirealistiske gytebunner for nivå 4
    fishing-hook-photoreal-v1.png  fotorealistisk krok og sluk for nivå 4
    river-shore-*.png     våt sand, grus og rullestein langs elvekanten
    river-end-light-*.png transparent, fotorealistisk undervannslys ved nivåutgangen
    power-plant-intake-*.png fotorealistisk kraftverksinntak med transparent bakgrunn
    food-*-v2.png         originale næringsdyr for elv og hav
  game/
    EventBus.ts           typed kommunikasjon mellom React og Phaser
    SalmonGame.tsx        livssyklus for Phaser-instansen
    SalmonScene.ts        verdener, nivåer, fysikk, AI og rendering
```

Grafikken kombinerer Phaser Graphics, CSS og originale rasterressurser laget for prosjektet med OpenAI ImageGen. Spill-laksen utvikler seg visuelt fra parrmerket lakseunge via sølvblank smolt og stor havlaks til kobber-/rødfarget gytefisk. Retningen er semirealistisk, organisk og taktil, men ressursene kopierer ikke figurer eller grafikk fra andre spill. Det finnes ingen eksterne bilde-, font- eller lydfiler med lisenskrav. Det enkle lydsystemet bruker Web Audio og starter først etter brukerinteraksjon.

## Kontroller

- Trykk eller klikk i vannet for å velge svømmemål.
- Hold og dra for å oppdatere retningen kontinuerlig.
- Alle nødvendige handlinger kan utføres med én finger eller én musepeker. Tastatur brukes ikke.

## Faglig ramme

Miljøene og kraftverkspassasjen er pedagogiske forenklinger, ikke geografiske eller tekniske rekonstruksjoner. Faktakortene er formulert uten udokumenterte detaljtall.

Kilder brukt som faglig utgangspunkt:

- [Besøkssenter villaks Laudal](https://www.villakssenteret.no/)
- [Mandalselva – Besøkssenter villaks](https://www.villakssenteret.no/naturveiledning/mandalselva/)
- [HydroCen/NINA – ledegjerde for fisk](https://hydrocen.nina.no/Resultater/Ledegjerde-for-fisk)
- [Havforskningsinstituttet – Atlantic salmon](https://www.hi.no/en/hi/temasider/species/salmon-atlantic)

## Publisering

Prosjektet er en statisk Vite-app og kan publiseres direkte på Vercel:

1. Importer prosjektmappen eller Git-repositoriet i Vercel.
2. Velg rammeverk **Vite**.
3. Bruk byggkommando `npm run build`.
4. Bruk publiseringsmappe `dist`.

Ingen miljøvariabler er nødvendige.
