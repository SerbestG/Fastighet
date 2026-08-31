# Införandeplan

Underlag enligt *Bilaga 5. Införandeplan*. Planen beskriver hur plattformen tas i
drift hos ett fastighetsbolag, med målet att införandet ska störa den löpande
förvaltningen så lite som möjligt.

## Delmoment och tidsplan

Tolv veckor från avtal till driftsättning. Veckorna är arbetsveckor.

| Vecka | Delmoment | Resultat |
| --- | --- | --- |
| 1 | Uppstart och avgränsning | Beslutade roller, kontaktvägar, miljöer och mötesstruktur |
| 1–2 | Miljöuppsättning | Test- och produktionsmiljö, konton, övervakning |
| 2–3 | Grafisk profil och begrepp | Logotyp, färger, egna begrepp, kontaktvägar inlagda |
| 3–5 | Fastighetsstruktur | Områden, fastigheter, byggnader, trapphus och hyresobjekt inlästa |
| 4–6 | Integration mot fastighetssystemet | Kunder, avtal, objekt och avier läses in i testmiljön |
| 5–7 | Ärendeflöde | Kategoriträd, handläggargrupper, fördelningsregler och svarstider satta |
| 6–8 | Bokning och passage | Resurser, bokningsregler och passagepunkter inlagda |
| 7–8 | Kommunikation | Mallar, kanaler och notisinställningar |
| 8–9 | Utbildning | Systemadministratörer och handläggare utbildade |
| 9–10 | Acceptanstest | Genomfört och godkänt av beställaren |
| 10–11 | Pilot | Ett område med skarpa hyresgäster |
| 12 | Driftsättning | Hela beståndet, uppföljning påbörjad |

## Milstolpar

| # | Milstolpe | Vecka | Villkor för godkännande |
| --- | --- | --- | --- |
| M1 | Miljöer klara | 2 | Beställaren kan logga in i testmiljön |
| M2 | Bestånd inläst | 5 | Struktur och objekt stämmer mot fastighetssystemet |
| M3 | Ärendeflöde klart | 7 | En felanmälan går hela vägen till avslut i testmiljön |
| M4 | Utbildning genomförd | 9 | Samtliga deltagare utbildade och kvitterade |
| M5 | Acceptanstest godkänt | 10 | Samtliga testfall godkända eller avvikelser accepterade |
| M6 | Pilot utvärderad | 11 | Inga öppna avvikelser av allvarlig grad |
| M7 | Driftsatt | 12 | Produktion i drift, förvaltningsöverlämning klar |

## Roller och resursplan

**Leverantören**

| Roll | Omfattning | Ansvar |
| --- | --- | --- |
| Projektledare | 25 % | Plan, uppföljning, avvikelser, kontakt med beställaren |
| Lösningsarkitekt | 30 % vecka 1–8 | Datamodell, integrationer, säkerhet |
| Systemtekniker | 50 % vecka 1–10 | Miljöer, inläsning, konfiguration |
| Utbildare | Vecka 8–9 | Utbildning och material |
| Support | Från vecka 10 | Pilot och driftsättning |

**Beställaren** – detta är vad vi behöver för att planen ska hålla:

| Roll | Omfattning | Ansvar |
| --- | --- | --- |
| Projektledare | 25 % | Beslut, prioritering, förankring |
| Systemförvaltare | 50 % vecka 2–12 | Konfiguration, begrepp, mallar, acceptanstest |
| Verksamhetsrepresentant | 20 % | Ärendeflöde, kategorier, svarstider |
| IT-samordnare | Vid behov | Entra ID, nätverk, e-post |
| Systemägare för Vitec och Aptus | Vid behov | Åtkomst, nycklar, avtal om dataöverföring |

## Utbildning

| Målgrupp | Antal | Dagar | Innehåll |
| --- | --- | --- | --- |
| Systemadministratörer | 2 | 2 | Fastighetsstruktur, användare och roller, behörighetsavgränsning, resurser, integrationer, säkerhetslogg, dataskyddsärenden |
| Handläggare och användare | 8 | 1 | Ärendeinkorg och fördelning, dialog med hyresgäst, arbetsorder, publicering av driftinformation, bokningar, uppföljning |

Utbildningen sker i testmiljön med bolagets egen struktur och egna begrepp, inte
i en generisk demomiljö. Efter varje tillfälle får deltagarna ett kort
referensmaterial på svenska. En uppföljande timme bokas två veckor efter
driftsättning, när de verkliga frågorna dykt upp.

## Go-Live-strategi

Införandet sker stegvis i tre steg:

1. **Pilot** i ett område under två veckor. Cirka 200 hyresgäster bjuds in.
   Ärenden och driftinformation körs skarpt, med det gamla arbetssättet kvar som
   reserv.
2. **Utvärdering** efter pilotens andra vecka. Ett gemensamt beslut fattas om att
   gå vidare, med öppna avvikelser åtgärdade eller accepterade.
3. **Full driftsättning** områdesvis under en vecka, med förhöjd bemanning i
   kundservice de första fem dagarna.

Under hela införandet fortsätter befintliga kanaler – telefon och e-post – att
fungera parallellt. Ingen hyresgäst blir utan väg in.

**Återgång.** Fram till full driftsättning är återgång alltid möjlig: det gamla
arbetssättet är kvar, och ärenden som skapats i plattformen kan exporteras.

## Struktur för acceptanstest

Acceptanstestet genomförs av beställaren i testmiljön, med stöd av leverantören.
Ett testfall är godkänt när beställaren själv har genomfört det.

| Område | Testfall |
| --- | --- |
| Konto och inloggning | Skapa konto med inbjudningskod, bekräfta e-post, logga in, logga in som personal med engångskod |
| Boende | Rätt bostad visas, rätt uppgifter på Mitt boende, medboende syns |
| Felanmälan | Anmälan med bild, akut anmälan styrs till jour, obligatoriska följdfrågor stoppar ofullständig anmälan |
| Ärendehantering | Fördelning, statusändring, otillåten övergång avvisas, intern anteckning syns inte för hyresgäst, dubbletter slås ihop |
| Arbetsorder | Skapa, entreprenören accepterar, registrerar ankomst, rapporterar hinder, slutför med tid och material |
| Kommunikation | Riktad publicering, schemaläggning, förhandsgranskning, bekräftelse, läskvitton |
| Bokning | Boka, avboka, dubbelbokning avvisas, spärrad tid avbokar och meddelar |
| Avier och dokument | Avier med OCR och betalstatus, dokument går att ladda ner |
| Flytt | Inflyttningschecklista, anmäld brist, uppsägning med tidigaste datum |
| Behörighet | Varje roll når rätt saker och nekas resten, känsliga ärenden kräver utökad behörighet |
| Kundseparering | Två bolag i samma miljö, inget läckage åt något håll |
| Tillgänglighet | Tangentbordsnavigation, skärmläsare, kontrast, mobil |

## Kvalitetssäkring, risker och riskhantering

| Risk | Sannolikhet | Följd | Hantering |
| --- | --- | --- | --- |
| Integration mot Vitec dröjer | Hög | Kundinformation måste läggas in manuellt | Filbaserad inläsning som reserv, klar redan vecka 4. Plattformen fungerar utan integrationen. |
| Datakvalitet i beståndet | Medel | Fel objekt eller adress i appen | Avstämningsrapport vid inläsning; avvikelser rättas i källsystemet, inte i plattformen |
| Passersystemet försenat | Medel | Inga digitala nycklar | Funktionen visas inte förrän integrationen är ansluten – hyresgästen får aldrig en nyckel som inte fungerar |
| Bristande förankring hos handläggare | Medel | Ärenden hanteras utanför systemet | Verksamhetsrepresentant med i konfigurationen från vecka 5, utbildning i bolagets egen miljö |
| Hög belastning vid driftsättning | Medel | Långa svarstider i kundservice | Områdesvis utrullning, förhöjd bemanning första veckan |
| Avvikelser upptäcks sent | Låg | Försenad driftsättning | Acceptanstest två veckor före pilot, veckovis avstämning från vecka 1 |
| Nyckelperson faller bort | Låg | Försening | Namngiven ersättare i varje roll, gemensam dokumentation |

Kvalitetssäkringen bygger på tre saker: veckovis avstämning med gemensam
avvikelselista, att varje milstolpe har ett uttalat villkor för godkännande, och
att beställaren själv genomför acceptanstestet.

## Checklista för avslutat införande

Införandet är avslutat när samtliga punkter är uppfyllda:

- [ ] Produktionsmiljö i drift med övervakning och backup
- [ ] Fastighetsstruktur och hyresobjekt inlästa och avstämda
- [ ] Integrationer antingen anslutna eller dokumenterat avvaktande med orsak
- [ ] Grafisk profil, begrepp och kontaktvägar inlagda
- [ ] Kategoriträd, handläggargrupper, fördelningsregler och svarstider satta
- [ ] Bokningsbara resurser och bokningsregler inlagda
- [ ] Roller och behörighetsavgränsningar satta för samtliga användare
- [ ] Tvåfaktorsautentisering aktiverad för samtliga personalkonton
- [ ] Gallringsregler beslutade och satta
- [ ] Utbildning genomförd och kvitterad
- [ ] Acceptanstest godkänt, avvikelser åtgärdade eller accepterade
- [ ] Pilot genomförd och utvärderad
- [ ] Dokumentation överlämnad
- [ ] Support- och eskaleringsvägar etablerade
- [ ] Förvaltningsöverlämning genomförd

## Kostnader för införandet

Kostnaderna specificeras i anbudets prisbilaga och omfattar: projektledning,
miljöuppsättning, konfiguration, inläsning av bestånd, integrationsarbete per
integration, utbildning enligt ovan, samt stöd under pilot och driftsättning.
Löpande licens- och driftkostnad redovisas separat.
