# Foodi

Beställ takeaway i förväg och hämta själv på restaurangen. Foodi är en klickbar
prototyp med tre vyer: kundens app, restaurangens arbetsyta och plattformens
admin. Allt körs i webbläsaren, så prototypen går att visa utan server.

> "Här hittar jag snabbt något gott, beställer enkelt och vet exakt när jag kan hämta."

## Kom igång

Förutsättningar: Node 20 eller senare.

```bash
cd foodi
npm install
npm run dev        # http://localhost:5180
```

| Kommando | Vad det gör |
| --- | --- |
| `npm run dev` | Startar utvecklingsservern |
| `npm run build` | Typkontroll och bygge till `dist/` |
| `npm run build:single` | Bygger hela prototypen som en enda fil i `dist-single/` |
| `npm test` | Enhetstester för priser, avgifter, öppettider och hämttider |
| `npm run e2e` | Går igenom kundens, personalens och adminens flöden i Chromium (kräver att `npm run dev` körs) |

`npm run e2e` letar efter Chromium i `/opt/pw-browsers/chromium`. Ange en annan
sökväg med miljövariabeln `CHROMIUM`.

## Vyer

| Vy | Adress | Innehåll |
| --- | --- | --- |
| Kund | `#/` | Startsida, sök och filter, restaurang, rätt med tillval, kassa, orderstatus, beställningar, favoriter, profil |
| Restaurang | `#/partner` | Ta emot beställningar, sätta hämttid, neka, markera klar och hämtad, meny och priser, slutsålt, bilder, öppettider, paus |
| Admin | `#/admin` | Nyckeltal, restauranger och provision, alla beställningar, kunder, avgifter och utbetalningar |

Restaurang- och adminvyn nås också från kundens profilsida.

## Kundens flöde

1. Välj område eller använd din plats (startsidan och sidhuvudet).
2. Utforska restauranger med sökning och filter för kök, pris, upphämtningstid, betyg och öppet nu.
3. Öppna en restaurang: meny, priser, öppettider, adress och tillagningstid.
4. Välj rätter, ta bort ingredienser, lägg till tillval och skriv en kommentar till köket.
5. Välj hämtning så snart som möjligt eller en senare tid (idag och två dagar framåt).
6. Betala och få en bekräftelse med ordernummer, adress och hämttid.
7. Följ status: mottagen, förbereds, klar att hämta.

Kunden behöver inget konto. Serviceavgiften visas med förklaring innan betalning
och varukorgen finns i botten av skärmen (mobil) eller i sidopanelen (dator)
under hela beställningen.

## Det här är simulerat

- **Betalning** med Swish, kort och mobilplånbok. Inga pengar dras och inga
  kortuppgifter efterfrågas; dialogen och kvittot säger det tydligt.
- **Sms och e-post.** Meddelandena visas på orderns sida i stället för att skickas.
- **Restaurangens svar.** Med *Autosvar (demo)* påslaget bekräftar och lagar
  demorestaurangen maten i snabbt tempo. Stäng av det i restaurangvyn för att
  styra beställningen själv. Knappen *Nästa steg* på orderns sida spolar fram.
- **Historik och kunder** i adminvyn är exempeldata som genereras deterministiskt
  för de senaste 30 dagarna.
- **Inloggning** för personal och admin. I prototypen går man in direkt.

Allt du gör sparas i webbläsarens lokala lagring och delas mellan flikar, så att
en beställning syns i restaurangvyn i en annan flik direkt. *Återställ demodata*
finns på profilsidan.

## Avgifter och moms

- Serviceavgift för kunden: 3 % av matpriset, högst 19 kr (ändras i adminvyn).
- Provision från restaurangen: 10–12 % av matpriset, per restaurang.
- Moms på takeaway-mat: 6 % (tillfälligt sänkt 1 april 2026–31 december 2027).
  Serviceavgiften redovisas med 25 % moms på kvittot.

## Struktur

```
src/
  types.ts          Domänmodell (restaurang, rätt, varukorg, order, avgifter)
  data/             Restauranger och menyer, områden, foton, exempelhistorik
  store/            Tillstånd och lagring, priser, sökning, meddelanden
  lib/              Format, öppettider och hämttider, avstånd, bilder
  components/       Gemensamma byggstenar (kort, ark, sidhuvud, varukorg)
  pages/customer/   Kundens sidor
  pages/partner/    Restaurangens vy
  pages/admin/      Adminvyn
  styles/           Formspråk och layout
scripts/            Bygge till en fil, skärmdumpar, webbläsartest
```

`store/store.ts` är den enda modulen som läser och skriver data. Ett riktigt API
ersätter den utan att sidorna behöver skrivas om; priser och hämttider räknas i
rena funktioner (`store/pricing.ts`, `lib/time.ts`) som kan flyttas till servern
oförändrade.

## Bilder

Matfotona är beskurna ur designskisserna. Restauranger utan egna foton visas med
ett omslag i sina egna färger, och rätter utan foto med en ruta i restaurangens
färg. Restaurangen kan ladda upp egna bilder i menyvyn. Nya foton läggs i
`src/assets/photos/` och registreras i `src/data/photos.ts`.

## Nästa steg mot en riktig tjänst

- API och databas för restauranger, menyer och beställningar, med realtidsuppdatering till restaurangvyn.
- Betalning via en betaltjänst med stöd för Swish, kort och mobilplånböcker, med återbetalning vid nekad order.
- Sms-utskick när beställningen är mottagen och klar.
- Inloggning för personal (t.ex. BankID eller e-post) och behörigheter per restaurang.
- Utbetalningar och självfaktura till restaurangerna.
