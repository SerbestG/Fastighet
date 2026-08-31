# Säkerhet och personuppgifter

## Autentisering

| Roll | Metod | Tvåfaktor |
| --- | --- | --- |
| Hyresgäst och medboende | E-post och lösenord, bekräftad adress | Frivillig, kan aktiveras i profilen |
| Personal | E-post och lösenord | **Obligatorisk.** Kontot kan inte användas förrän den är aktiverad |
| Entreprenör | E-post och lösenord | Frivillig |

Lösenord lagras med scrypt (N = 2¹⁵, r = 8) och unikt salt. Åtta misslyckade
försök låser kontot i femton minuter. Svaret vid okänt konto är identiskt med
svaret vid fel lösenord, så att inloggningen inte kan användas för att kartlägga
vilka adresser som är registrerade.

Personalkonton utan tvåfaktor får inte en session vid inloggning. I stället
returneras uppgifterna som behövs för att aktivera den, och sessionen skapas
först när en giltig engångskod verifierats.

**BankID** för hyresgäster och **federerad inloggning mot Microsoft Entra ID** för
personal är förberedda i integrationsregistret. Kopplingen till rätt kundpost sker
via en nyckelbunden hash av personnumret – numret lagras aldrig i klartext.
Inloggningssätten visas inte i gränssnittet förrän respektive integration är i
status *Ansluten*, eftersom en knapp som inte fungerar är sämre än ingen knapp.

## Sessioner

Åtkomsttoken är kortlivad (15 minuter) och signerad med HMAC-SHA256.
Uppdateringstoken lagras endast som hash och **byts vid varje användning** – en
läckt token kan användas en gång, och stölden märks när originalet slutar
fungera.

Sessioner avslutas efter inaktivitet: **30 minuter för personal**, 14 dagar för
hyresgäster. Den absoluta livslängden är 30 dagar. Vid lösenordsbyte och vid
ändrade behörigheter avslutas användarens övriga sessioner omedelbart.

I webbläsaren ligger åtkomsttoken i `sessionStorage` och försvinner när fliken
stängs.

## Behörighet

Behörighetsmatrisen i `packages/shared/src/roles.ts` är den enda källan till
sanning och används av backend vid varje anrop. Gränssnittet använder samma matris
enbart för att dölja irrelevanta val – aldrig som skydd.

Kontrollen sker i tre steg:

1. **Organisation.** Row Level Security i databasen (se [arkitektur](arkitektur.md)).
2. **Behörighet.** Rollen måste ha rätt behörighet för åtgärden.
3. **Objekt.** En hyresgäst når bara sitt eget boende. En handläggare når bara de
   områden och fastigheter personen tilldelats. En entreprenör når bara sina egna
   arbetsorder.

Störnings- och trygghetsärenden markeras som **känsliga** och kräver behörigheten
`case:read_sensitive`. De filtreras bort ur ärendelistor för den som saknar den,
och ett direktanrop mot ärendets id nekas.

En handläggarroll utan tilldelad avgränsning ser ingenting förrän en tilldelas.
Det är ett medvetet val: det är bättre att en ny medarbetare hör av sig om att
listan är tom än att personen råkar se hela beståndet.

## Loggning och spårbarhet

Säkerhetsloggen (`audit_log`) fångar inloggningar, behörighetsändringar,
ärendeåtgärder, publiceringar, filhämtningar, tillträdesändringar och
dataskyddsärenden. Varje rad har tidpunkt, aktör, roller, IP-adress, spårnings-ID
och utfall.

Loggen är **append-only i databasen**: applikationsrollen saknar `UPDATE` och
`DELETE` på tabellen. Ett försök att ändra en rad avvisas av databasen, inte av
koden. Detsamma gäller integrationsloggen.

Loggens detaljfält passerar en filtrering som ersätter lösenord, tokens,
API-nycklar och personnummer med `[borttaget]`, även om de skulle skickas med av
misstag. Samma fält redigeras bort ur serverloggarna.

Varje svar bär ett spårnings-ID som också visas i gränssnittets fellägen, så att
en användare kan uppge exakt vilket anrop som gick fel.

## Filer

- Tillåtna typer och maxstorlek (25 MB) är konfigurerbara.
- Filens verkliga inledande byte kontrolleras mot den angivna typen.
- Filer som inleds med skript- eller HTML-markörer avvisas oavsett angiven typ.
- Filer lagras utanför webbroten, med slumpad nyckel per organisation, rättigheter
  `0600`.
- Nedladdning sker via API:et med behörighetskontroll vid varje hämtning, med
  `Content-Disposition: attachment` och `X-Content-Type-Options: nosniff`.
- Sökvägen kontrolleras mot lagringsroten så att en manipulerad referens inte kan
  peka ut något annat på disken.

**Extern virusskanning saknas.** Filer får status `clean` efter typkontrollen.
Ett anrop till en skanningstjänst ska kopplas in innan produktionssättning; fältet
`scan_status` finns redan och nedladdning av en fil som inte är godkänd nekas.

## Transport

TLS terminieras före applikationen. I produktionsläge sätter servern
`Strict-Transport-Security` med två års livslängd, `includeSubDomains` och
`preload`. Innehållssäkerhetspolicyn tillåter inget aktivt innehåll från API:et.
Anrop utifrån begränsas till de webbadresser som konfigurerats.

## Hastighetsbegränsning

Generellt 300 anrop per minut, räknat per konto när användaren är känd och annars
per adress. Inloggning och registrering begränsas till 10 försök per minut.

## Personuppgifter

**Export.** En hyresgäst kan när som helst ladda ner sina egna uppgifter från
profilen: konto, boenden, ärenden, bokningar, meddelanden, avier, notiser och
lämnad återkoppling.

**Rättelse.** Kontaktuppgifter ändras av hyresgästen själv. Ändringen köas mot
fastighetssystemet när den integrationen är ansluten; tills dess får användaren
tydligt besked om att uppgiften ännu inte förts vidare.

**Anonymisering.** Administratörer kan registrera och genomföra en anonymisering.
Namn, e-post, telefon, lösenord och externa referenser rensas, sessioner avslutas
och pushtoken tas bort. Ärendehistorik och statistik behålls utan koppling till
personen, så att förvaltningen kan följa upp arbetet utan att uppgifterna finns
kvar.

**Gallring.** Reglerna ligger i `retention_policies` per organisation och används
av bakgrundsjobbet – gallringstiderna är inte hårdkodade. Standard: notiser 1 år,
avslutade sessioner 90 dagar, inloggningsförsök 180 dagar, säkerhetslogg 2 år,
ärenden anonymiseras efter 10 år.

**Dataminimering i notiser.** Pushnotiser innehåller bara en kort inledning – inte
ärendets innehåll. Detaljerna läses i appen efter inloggning.

**Enkätsvar.** När en enkät är anonym lagras inget användar-id. I stället sparas en
nyckelbunden hash som bara hindrar dubbelsvar och inte går att räkna baklänges.
Resultat redovisas per fastighet och område, och grupper med färre än fem svar
redovisas inte i detalj. Fritextsvar ingår aldrig i sammanställningen.

**Entreprenörers åtkomst.** Hyresgästens namn och telefonnummer lämnas ut först
när uppdraget accepterats, och enbart för det aktuella uppdraget. Avtal, avier och
andra ärenden är aldrig åtkomliga.

## AI

Plattformen fattar inga beslut med språkmodeller. Prioritering, kategorisering och
statusflöden är deterministiska regler i `packages/shared`, vilket är kontrollerat
med tester. Det innebär att ingen ärendestatus kan hittas på, att inga meddelanden
kan skickas utan godkännande och att ingen kunddata lämnar plattformen för
modellträning.

Om AI-stöd senare införs – till exempel förslag på formulering eller kategori –
ska det byggas som ett förslag som en människa godkänner, avgränsas per
organisation, och först efter beställarens godkännande (krav C.10.1, C.10.2).

## Kända begränsningar

| Område | Läge | Vad som krävs |
| --- | --- | --- |
| Virusskanning av uppladdade filer | Typkontroll finns, extern skanning saknas | Anslutning till skanningstjänst |
| BankID | Förberett, ej anslutet | Avtal och produktionscertifikat |
| Federerad inloggning (Entra ID) | Förberett, ej anslutet | Appregistrering i kundens katalog |
| Säkerhetstest av tredje part | Ej genomfört | Penetrationstest före produktionssättning |
| Hemlighetshantering | Miljövariabler | Hemlighetstjänst i driftmiljön |
| Kryptering av lagrade filer | Filsystemets rättigheter | Diskkryptering eller objektlagring med kryptering |
