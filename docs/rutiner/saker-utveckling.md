# Säker utveckling och teknisk förändring

Besvarar krav C.6.1–C.6.7.

## C.6.1 Begränsad åtkomst till kod, anpassningar och byggmiljöer

| Vad | Vem har åtkomst | Hur den ges |
| --- | --- | --- |
| Kodbasen | Utvecklare i uppdraget | Personligt konto hos kodvärden, med multifaktor. Inga delade konton. |
| Byggkedjan | Utvecklingsansvarig konfigurerar, alla ser körningarna | Rättigheter följer kodbasens. |
| Hemligheter i byggkedjan | Utvecklingsansvarig och driftansvarig | Läggs in som skyddade värden, syns aldrig i loggar. |
| Produktionsmiljön | Driftansvarig | Se C.1.6. Utvecklare har inte åtkomst till produktion. |

Åtkomst tas bort samma dag som någon lämnar uppdraget. Genomgången varje halvår
(C.1.1) fångar det som ändå blivit kvar.

Kundunika anpassningar för beställaren lagras som data per organisation —
profil, begrepp, moduler, resurser, kategorier — inte som en egen kodgren. Det
gör att de följer med vid uppgradering (krav A.1.5) och att ingen behöver ha
åtkomst till en särskild gren för att förvalta dem.

## C.6.2 Versionskontroll och spårbar hantering

All kod och all konfiguration ligger i Git. Varje ändring går in genom en
granskad sammanslagning, aldrig direkt på huvudgrenen. Historiken visar vad som
ändrats, av vem och varför.

Databasens struktur ändras bara genom numrerade migreringsfiler i
`packages/api/src/db/migrations/`. De körs i ordning och registreras i tabellen
`schema_migrations`, så att det går att se exakt vilken struktur en miljö har.

## C.6.3 Separerade miljöer

| Miljö | Innehåll | Åtkomst |
| --- | --- | --- |
| Utveckling | Demodata från `npm run db:reset` | Utvecklarens egen maskin |
| Test | Demodata, egen databas, egna hemligheter | Beställaren och leverantören |
| Produktion | Verkliga uppgifter | Driftansvarig |

Miljöerna delar varken databas, lagring eller hemligheter. Personuppgifter från
produktion kopieras aldrig till test eller utveckling. Behövs verklighetsnära
data för felsökning skapas den syntetiskt.

## C.6.5 Möjlighet att återställa eller korrigera ändringar

**Applikationen.** Varje release är en byggd artefakt med ett versionsnummer.
Att gå tillbaka innebär att sätta föregående artefakt i drift, vilket tar
minuter, inte timmar.

**Databasen.** Migreringar är framåtriktade. En ändring som visar sig fel
åtgärdas med en ny migrering som rättar, inte genom att köra en bakåtmigrering —
det senare riskerar att kasta data. För en ändring som tar bort eller skriver om
data gäller därför:

1. Släpp först en migrering som lägger till det nya utan att röra det gamla.
2. Släpp applikationen som börjar använda det nya.
3. Släpp först i en senare release migreringen som tar bort det gamla.

Mellan steg 2 och 3 går det att gå tillbaka utan dataförlust. Ordningen är ett
krav vid granskning av migreringar som rör befintlig data.

**Vid allvarligt fel.** Driftansvarig får sätta föregående version i drift utan
att invänta beslut. Beslutet dokumenteras i efterhand, och beställaren
underrättas enligt incidentrutinen om felet påverkat dem.

## C.6.6 Säkerhetstester vid större förändringar

En förändring räknas som större när den rör autentisering, behörighet,
kundseparering, filhantering, loggning eller ett externt gränssnitt. Då tillkommer:

- genomgång mot OWASP ASVS för de delar som berörs,
- nya eller utökade tester som täcker det som ändrats — särskilt
  kundsepareringen, som har en egen testfil,
- vid ändring i ett externt gränssnitt: förnyat penetrationstest av den delen.

## C.6.7 Hantering av upptäckta sårbarheter

Gäller egen kod, tredjepartskomponenter och driftmiljö. Klassning och tider
enligt C.1.2.

**Egen kod.** Brister som hittas vid granskning, test eller av beställaren läggs
in med samma klassning som externa sårbarheter.

**Tredjepartskomponenter.** Granskning vid varje bygge. Ett bygge med en känd
kritisk eller allvarlig sårbarhet i en komponent som körs i drift går inte
vidare till produktion.

**Driftmiljö.** Säkerhetsuppdateringar för operativsystem och databas läggs in
inom samma tider, med den skillnaden att en omstart planeras in i ett
tidsfönster som beställaren fått besked om.

En sårbarhet som rapporteras utifrån tas emot på leverantörens kontaktadress för
säkerhetsfrågor, bekräftas inom en arbetsdag och besvaras med en bedömning inom
fem arbetsdagar.
