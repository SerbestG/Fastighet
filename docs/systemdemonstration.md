# Systemdemonstration

Manus enligt *Bilaga 6. Program för systemdemonstration*. Demonstrationen sker
direkt i systemets testmiljö. Allt nedan är genomförbart i den levererade
produkten med demodata.

**Förberedelse.** Kör `npm run db:reset` och `npm run dev`. Ha tre webbläsarfönster
öppna: hyresgäst, handläggare och entreprenör. Personalkonton kräver en engångskod
från autentiseringsappen.

---

## Allmän presentation (15 minuter)

**b) Systemdelar.** Tre gränssnitt mot ett API: hyresgästens app (mobil först),
förvaltningens arbetsyta (desktop) och entreprenörsportalen. Samma
behörighetsmatris styr alla tre.

**c) Teknisk uppbyggnad.** Molntjänst. Statslöst API i Node.js, PostgreSQL som
databas, fillagring utanför webbroten. Klienterna är webbaserade och kräver ingen
installation. All kommunikation sker över TLS.

Visa gärna kundsepareringen konkret här – den är svår att visa i efterhand:

```bash
npm test -w @hemvist/api -- isolation
```

Fjorton tester som körs mot två skarpa fastighetsbolag i samma databas.
Poängen: separationen ligger i databasen, inte i ett villkor någon kan glömma.

**d) Införandeplan.** Se [`infarandeplan.md`](infarandeplan.md) – tolv veckor,
sju milstolpar, pilot före full driftsättning.

**e) Utvecklingsplan.** Närmast: paketering som mobilapplikation, integration mot
Vitec och Aptus, extern virusskanning av bilagor och en oberoende
tillgänglighetsgranskning.

---

## Scenario 1: Gränssnitt, vyer och överblickbarhet (15 minuter)

> *"Nu startar scenario 1."*

**Inloggning och registrering.** Visa inloggningssidan. Bolagets namn och färger
slår igenom redan här. Peka på raden längst ned: inloggning med BankID och
organisationskonto visas först när respektive integration är ansluten – vi visar
inte en knapp som inte fungerar.

Visa registrering med inbjudningskod. Koden kopplar kontot till rätt hyresobjekt;
en hyresgäst kan alltså inte registrera sig till fel bostad.

**Vy för systemadministratör.** Logga in som `anna.lindqvist@demo-botkyrkabyggen.se`.
Engångskoden krävs – personalkonton kan inte användas utan tvåfaktor.

Gå igenom översikten: öppna, akuta och försenade ärenden, svarstider,
kundnöjdhet, vanligaste feltyper, ärenden per fastighet, kommande besök,
pågående driftstörningar och entreprenörsuppföljning.

Klicka på **Akuta ärenden**. Talet öppnar ärendeinkorgen med exakt det urval
siffran bygger på. Varje nyckeltal går att spåra tillbaka till underlaget – inget
är dekoration.

Visa de fem vyerna i inkorgen: lista, tavla, kalender, karta och statistik. Samma
urval, olika sätt att se det.

Gå kort in i Fastigheter (sök och filtrera i hela strukturen), Användare (roller
och avgränsning till område) och Integrationer.

**Vy för kund.** Byt fönster till hyresgästen. Startsidan är personlig: hälsning,
adress, och under Aktuellt bara det som gäller just nu – driftinformation som rör
adressen, pågående ärenden, nästa avi och kommande bokningar. Finns inget nytt
står det. Fem flikar längst ned; resten under Mer.

> *"Nu slutar scenario 1."*

---

## Scenario 2: Felanmälan och ärendehantering (15 minuter)

> *"Nu startar scenario 2."*

### a) Kundens perspektiv

**Skapa nytt ärende.** Startsidans främsta knapp är Gör en felanmälan.

**Välj objekt och ärendetyp.** Steg 1: I bostaden, annat objekt i avtalet, eller
gemensamt utrymme. Alternativen kommer från hyresgästens egna avtal.

Steg 2: Femton kategorier med kort ledtext, sedan underkategori.

**Välj utrymme och fyll i formuläret.** Välj Vatten och avlopp → Vattenläcka →
utrymme Badrum.

Följdfrågorna kommer från kategorin. Svara: läckan pågår, vattnet går **inte** att
stänga av, risk för skada finns.

Ärendet blir akut direkt i formuläret, med jourens nummer och besked om vad
hyresgästen ska göra först. Det här är kravbildens kärna: akuta fel ska styras
till rätt jourflöde, inte hamna i en vanlig kö.

**Bifoga bild.** Lägg till en bild i steg 4. Filens verkliga innehåll kontrolleras
– en fil som utger sig för att vara en bild men innehåller något annat avvisas.

Steg 5: tillträdestider, godkännande av huvudnyckel, husdjur. Steg 6:
sammanfattning. Skicka.

**Se ärendet i appen.** Hyresgästen hamnar direkt i ärendet med tidslinje och
bekräftelse.

**Se sammanställning med status.** Gå till Ärenden. Pågående och avslutade, med
statusen Ej påbörjad, Påbörjad eller Avslutad – enkelt för hyresgästen, medan
förvaltningen arbetar med tio detaljerade statusar internt.

### b) Handläggarens perspektiv

**Ta emot och fördela.** Byt till handläggaren. Ärendet ligger överst, markerat
som akut. Öppna det.

Följdfrågorna redovisas med svaren i klartext, och det svar som gjorde ärendet
akut är markerat. Handläggaren behöver inte gissa varför.

Tilldela handläggare i sidopanelen. Statusen följer med automatiskt.

Peka på **Liknande ärenden i samma byggnad**: om flera hyresgäster rapporterar
samma sak kan ärendena slås ihop, så att arbetet görs en gång men varje hyresgäst
ändå får återkoppling i sitt eget ärende.

**Återkoppla till hyresgästen.** Under Dialog finns två fält: svar till hyresgäst
och intern anteckning. Skriv båda.

Byt till hyresgästens fönster och ladda om: svaret syns, den interna anteckningen
finns inte där. Det är kontrollerat i backend, inte bara dolt i gränssnittet.

**Sammanställning av utförd aktivitet.** Skapa en arbetsorder till entreprenören.
Byt till entreprenörsfönstret: uppdraget ligger där, men hyresgästens
kontaktuppgifter visas inte förrän uppdraget accepterats. Acceptera – då blir de
synliga.

Registrera ankomst, markera som klar med nedlagd tid och material.

Tillbaka hos hyresgästen: ärendet är klart, med en notis. Hyresgästen bekräftar
att felet är löst och sätter betyg.

Tillbaka hos handläggaren: översikten visar den nya kundnöjdheten och
entreprenörsuppföljningen den nedlagda tiden.

> *"Nu slutar scenario 2."*

---

## Scenario 3: Nyheter och notifiering (10 minuter)

> *"Nu startar scenario 3."*

### a) Handläggarens perspektiv

**Skapa och editera nyhet.** Gå till Driftinfo och nyheter → Nytt inlägg. Välj typ
Hissfel, prioritet Viktigt. Skriv rubrik, sammanfattning och text.

**Koppla till urval.** Öppna området i mottagarträdet och välj fastigheten. Antalet
berörda hyresgäster räknas fram direkt – *"12 hyresgäster berörs"*. Urvalet kan
göras på område, fastighet, byggnad, trapphus, enskild lägenhet eller enskilt
avtal, och flera nivåer samtidigt.

**Tidsinställd publicering.** Visa fälten för publiceringstid, avpubliceringstid
och att fästa inlägget överst. Ett bakgrundsjobb sköter publiceringen.

**Förhandsgranska.** Klicka Förhandsgranska. Inlägget visas som det ser ut i
appen, innan något skickas.

**Skicka notifiering.** Kryssa i att mottagaren ska bekräfta informationen och
publicera. Antalet mottagare bekräftas.

**Sammanställning.** Listan visar publicerade, schemalagda och arkiverade inlägg
med antal lästa och antal bekräftade – uppföljning av att informationen faktiskt
nått fram.

### b) Kundens perspektiv

**Ställa in val av notiser.** Byt till hyresgästen, gå till Profil → Notiser. Varje
ämne styrs per kanal: i appen, push, e-post och SMS. Kritisk säkerhetsinformation
är markerad *Alltid på* och går inte att stänga av.

**Hitta och läsa nyheten.** Klockan i sidhuvudet visar en oläst notis. Öppna den –
notisen leder till rätt sida och rätt objekt, inte bara till startsidan.

Inlägget visar vad som hänt, vilka som berörs, starttid, beräknad sluttid, nästa
uppdatering och kontaktväg. Bekräfta informationen.

**Ta emot push i mobil enhet.** Kanalen är förberedd och notisen skapas med rätt
mottagare, ämne och länkmål. Utan nycklar för APNs och FCM läggs den i utgående kö
och markeras som blockerad – det syns i driftvyn att den inte gått fram, i stället
för att den tyst försvinner. Vi visar hellre kön än ett påhittat leveranskvitto.

Tillbaka hos handläggaren: bekräftelsen syns i sammanställningen.

> *"Nu slutar scenario 3."*
