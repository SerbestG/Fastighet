# Systematiskt säkerhetsarbete

Besvarar krav C.1.1–C.1.13.

## C.1.1 Dokumenterat och systematiskt säkerhetsarbete

Säkerhetsarbetet följer en årscykel med fyra fasta punkter. Säkerhetsansvarig
kallar, och protokollet sparas.

| När | Vad | Utfall |
| --- | --- | --- |
| Varje kvartal | Genomgång av risker, incidenter, sårbarheter och avvikelser sedan förra gången. | Uppdaterad riskförteckning med beslutade åtgärder och ansvarig. |
| Varje halvår | Genomgång av behörigheter: vilka har administrativ åtkomst, och behöver de fortfarande den. | Återkallade behörigheter, dokumenterat beslut för dem som behålls. |
| Varje år | Genomgång av rutinerna i den här mappen mot hur arbetet faktiskt bedrivs. | Reviderade rutiner, eller ett beslut att de gäller oförändrade. |
| Varje år | Övning av incidentrutinen och av återställning från backup. | Protokoll med vad som fungerade och vad som ska ändras. |

Risknivån styr ambitionen. Tjänsten hanterar personuppgifter om boende,
inklusive uppgifter om deras bostad och deras ärenden, men inga särskilda
kategorier av personuppgifter och inga betalningar. Det placerar den i mellersta
risknivån: kryptering, spårbarhet och behörighetsstyrning krävs, men inte
åtgärder avsedda för samhällsviktig verksamhet.

## C.1.2 Rutiner för säkerhetsbrister och säkerhetsuppdateringar

**Var brister upptäcks.** Automatisk beroendegranskning körs vid varje bygge
(`.github/workflows/ci.yml`). Utöver det bevakas leverantörernas
säkerhetsmeddelanden för de komponenter tjänsten vilar på: Node.js, PostgreSQL
och de direkta beroendena i `package.json`.

**Hur de klassas.** Klassningen utgår från CVSS men justeras efter hur
komponenten faktiskt används. En sårbarhet i ett byggverktyg som aldrig körs i
drift är inte lika brådskande som samma poäng i en komponent som tar emot
anrop från internet.

| Klass | Åtgärdas inom | Exempel |
| --- | --- | --- |
| Kritisk | 24 timmar | Fjärrkörning av kod i en komponent som exponeras mot internet. |
| Hög | 7 dagar | Autentiseringsförbikoppling, läsning av annan kunds data. |
| Medel | 30 dagar | Sårbarhet som kräver redan uppnådd åtkomst. |
| Låg | Nästa planerade release | Sårbarhet i verktyg som bara körs vid utveckling. |

**Vem som beslutar.** Säkerhetsansvarig klassar och beslutar. Utvecklings-
ansvarig åtgärdar. Kan en brist inte åtgärdas inom sin tid dokumenteras varför,
vilken kompenserande åtgärd som vidtagits, och när den ska omprövas.

## C.1.3 Uppdatering och underhåll under avtalstiden

Beroenden gås igenom varje månad och uppgraderas i samma takt som de släpps,
inte i klump vid avtalets slut. Större versionshopp planeras in i en release med
egen testrunda. Underhållet ingår i avtalet och faktureras inte separat.

Vid tiden för det här underlaget rapporterar `npm audit` noll sårbarheter.

## C.1.4 God praxis för säker utveckling och webbsäkerhet

Arbetet följer OWASP ASVS nivå 2 som måttstock och OWASP Top 10 som checklista
vid granskning. Det som är byggt in i produkten:

| Risk | Hur den hanteras | Var |
| --- | --- | --- |
| Trasig behörighetskontroll | Behörighet prövas i backend vid varje läsning och skrivning, och kundsepareringen ligger under applikationen i databasen. | `src/core/context.ts`, `migrations/009_rls.sql` |
| Kryptografiska brister | Lösenord hashas med scrypt, uppslagsvärden med pepprad HMAC, token lagras hashade. | `src/core/crypto.ts` |
| Injektion | Alla frågor är parametriserade. Ingen SQL byggs av strängar med indata. | Genomgående |
| Osäker design | Ärendeflödet har bestämda tillstånd, och statusbyten som inte finns i övergångstabellen avvisas. | `packages/shared/src/domain.ts` |
| Felaktig konfiguration | Servern vägrar starta om databasrollen kan kringgå kundsepareringen. | `src/db/verify-isolation.ts` |
| Föråldrade komponenter | Se C.1.3. | |
| Autentiseringsfel | Engångskod för personal, låsning efter upprepade försök, sessioner som avslutas vid inaktivitet. | `src/modules/auth.ts` |
| Brister i dataintegritet | Filer kontrolleras mot sitt verkliga innehåll och rensas på metadata. | `src/core/files.ts`, `src/core/media.ts` |
| Brister i loggning | Säkerhetsloggen kan bara läsas och fyllas på, aldrig ändras. | `migrations/010_grants.sql` |
| Förfalskade serveranrop | Spegling hämtar bara från beställarens egen webbplats. | `src/modules/mirror.ts` |

## C.1.5 Återkommande säkerhetstester

| Kontroll | Hur ofta | Utförare |
| --- | --- | --- |
| Automatiska säkerhetstester i testsviten | Vid varje bygge | Byggkedjan |
| Beroendegranskning | Vid varje bygge | Byggkedjan |
| Egen genomgång mot OWASP ASVS | Varje halvår | Säkerhetsansvarig |
| Penetrationstest av extern part | Före driftsättning och därefter varje år, samt vid större förändring | Upphandlad leverantör |

Penetrationstestet är **inte genomfört**. Det kräver en extern part och en miljö
att testa mot, och ska beställas inför driftsättning.

Testsviten innehåller i dag 182 tester (164 mot API:et och 18 i webbklienten), varav 14 prövar kundsepareringen genom
att logga in i två fastighetsbolag och begära varandras uppgifter, och 17 prövar
autentisering, sessionshantering och lösenordshantering.

## C.1.6 Säker hantering av administratörs- och supportåtkomst

- Administrativ åtkomst till driftmiljön ges personligt, aldrig till delade konton.
- Åtkomsten kräver multifaktor och ges tidsbegränsat för en namngiven uppgift.
- Support som behöver se en kunds uppgifter gör det genom tjänstens egna
  gränssnitt med en personlig inloggning, så att åtkomsten hamnar i
  säkerhetsloggen. Direktåtkomst till databasen används bara vid felsökning som
  inte går att göra på annat sätt, och dokumenteras då i efterhand.
- Behörigheter gås igenom varje halvår enligt C.1.1.

## C.1.7 Skydd mot skadlig kod

- Uppladdat innehåll kontrolleras mot sitt verkliga format, och en fil vars
  innehåll inte stämmer med den angivna typen avvisas (`src/core/files.ts`).
- PDF-filer som startar program eller kör skript vid öppning avvisas
  (`src/core/media.ts`).
- En extern skanningstjänst kopplas in via `FILE_SCAN_URL`. När en sådan är
  konfigurerad men inte svarar hamnar filen i karantän i stället för att släppas
  igenom (`src/core/scanning.ts`).
- Servrar i driftmiljön kör bara den kod som byggkedjan producerat. Inloggning
  på servrarna sker med nyckel, inte lösenord.

Extern skanningstjänst är **inte upphandlad**. Utan den gäller enbart de
strukturella kontrollerna ovan.

## C.1.8 Kontrollerad hantering av säkerhetsrelevanta konfigurationer

All konfiguration som styr tjänstens beteende ligger i versionshanterad kod
eller i miljövariabler som beskrivs i `.env.example`. Hemligheter ligger aldrig
i databasen eller i kodbasen: databasen bär bara en referens, som slås upp i
driftmiljön (`src/core/secrets.ts`).

Ändring av en säkerhetsrelevant konfiguration — kundseparering, autentisering,
loggning, filhantering — kräver granskning av en andra person och noteras i
ändringsloggen.

## C.1.9 Rutiner för att testa, godkänna och återställa ändringar

Se [saker-utveckling.md](saker-utveckling.md), avsnitt C.6.5.

## C.1.10 Tester före produktionssättning

Ingen ändring når produktion utan att hela testsviten och bygget gått igenom i
byggkedjan. Vid större förändringar tillkommer en genomgång i testmiljön av
beställaren, enligt införandeplanen.

## C.1.11 Dokumentation över tekniska huvudkomponenter

Finns i [../arkitektur.md](../arkitektur.md), som beskriver komponenter,
datamodell, driftmodell och de val som gjorts. Dokumentet uppdateras i samma
ändring som koden när något av det ändras.

## C.1.12 Logisk eller fysisk separering mellan kunder

Separeringen är logisk och ligger i databasen. Varje tabell med `org_id` har en
policy som binder raden till den organisation som satts för transaktionen, och
applikationens databasroll saknar både `SUPERUSER` och `BYPASSRLS`. Servern
vägrar starta om det inte stämmer.

Att det håller prövas av 14 tester som loggar in i båda demobolagen och begär
varandras ärenden, filer, hyresgäster och avier med giltig session och rätt
id — och får noll rader tillbaka.

## C.1.13 Testmiljö

En testmiljö med samma uppsättning som produktion ingår i leveransen. Den körs
med egen databas och egna hemligheter, och innehåller demodata — aldrig
kopierade personuppgifter från produktion. Nya funktioner, integrationer och
förändringar prövas där innan de går vidare.
