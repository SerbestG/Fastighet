# Backup, kontinuitet och återställning

Besvarar krav C.8.1–C.8.5, och krav A.6.1 om att backup ska kunna tas utan
driftstopp.

## C.8.1 Dokumenterad rutin för backup och återställning

### Vad som säkerhetskopieras

| Data | Metod | Hur ofta | Sparas |
| --- | --- | --- | --- |
| Databasen | Fullständig dump | Varje dygn | 30 dagar |
| Databasen | Kontinuerlig arkivering av transaktionsloggen | Löpande | 30 dagar |
| Uppladdade filer | Ögonblicksbild av lagringen | Varje dygn | 30 dagar |
| Konfiguration och hemligheter | Hos hemlighetshanteringen, versionerad | Vid ändring | 90 dagar |
| Kod och migreringar | Git, hos kodvärden | Vid ändring | Obegränsat |

Backup tas online. PostgreSQL kopieras med `pg_dump` respektive kontinuerlig
arkivering, och tjänsten behöver inte stängas av (krav A.6.1).

Den kontinuerliga arkiveringen är det som avgör hur mycket som kan gå förlorat.
Med den kan återställning ske till en godtycklig tidpunkt inom 30 dagar, vilket
ger en dataförlust räknad i minuter i stället för upp till ett dygn.

### Mål

| Mått | Värde | Innebörd |
| --- | --- | --- |
| Återställningstid (RTO) | 4 timmar | Tid från beslut om återställning till tjänst i drift. |
| Dataförlust (RPO) | 15 minuter | Hur mycket som kan gå förlorat i värsta fall. |

Målen gäller under förutsättning att driftmiljön går att nå. Vid ett bortfall av
hela driftplattformen styr plattformsleverantörens egna åtaganden.

### Återställning

1. Driftansvarig beslutar, och underrättar tjänsteansvarig och beställaren.
2. Välj tidpunkt att återställa till. Vid dataförlust genom felaktig ändring:
   tidpunkten strax före ändringen.
3. Ställ upp en ny databas, återläs dumpen och spela fram transaktionsloggen.
4. Återställ fillagringen till samma tidpunkt.
5. Kontrollera innan tjänsten öppnas: att migreringarna är fullständiga, att
   kundsepareringen verifieras vid start, och att stickprov på ärenden, avier
   och filer stämmer.
6. Öppna tjänsten och underrätta beställaren.

## C.8.2 Skydd av backuper

- Backuper krypteras i vila, med nycklar som förvaras skilt från backuperna.
- Åtkomst har bara driftansvarig, personligt och med multifaktor.
- Backuperna ligger i en annan lagringsplats än den databasen använder, så att
  ett fel som drabbar den ena inte drabbar den andra.
- Åtkomst till backup loggas.
- Backuper innehåller personuppgifter och lyder därför under samma
  gallringstider: en återställd backup får inte användas för att återuppliva
  uppgifter som gallrats.

## C.8.3 Regelbunden provning av återställning

| Prov | Hur ofta | Vad som kontrolleras |
| --- | --- | --- |
| Automatisk provläsning av senaste dumpen | Varje vecka | Att dumpen går att läsa in och att tabellerna finns. |
| Fullständig återställningsövning | Varje år | Hela kedjan ovan, inklusive tidsmätning mot RTO. |

Övningen genomförs mot en separat miljö, aldrig mot produktion. Protokollet
noterar uppmätt tid och vad som ska förbättras. Klarar övningen inte målen
räknas det som en avvikelse och hanteras i kvartalsgenomgången.

## C.8.4 Övervakning av kapacitet och prestanda

| Mätvärde | Larmar vid |
| --- | --- |
| Svarstid på API:et, 95:e percentilen | Över 1 000 ms i 5 minuter |
| Andel svar med fel (5xx) | Över 1 procent i 5 minuter |
| Databasanslutningar i bruk | Över 80 procent av poolen |
| Diskutrymme för databas och fillagring | Under 20 procent kvar |
| Ålder på köade utskick | Över 30 minuter |
| Misslyckade synkroniseringar mot verksamhetssystem | Fler än 3 i rad |

Tjänsten har två kontroller för det ändamålet: `/api/health` svarar på om
processen lever, och `/api/health/ready` på om den kan nå databasen och är redo
att ta emot anrop. Bakgrundsjobbens körningar registreras i tabellen `job_runs`,
så att ett jobb som slutat köra går att upptäcka.

Larm går till beredskapen. Ett larm som inte kvitteras inom 15 minuter går
vidare till tjänsteansvarig.

## C.8.5 Förmåga att hantera driftstörningar

- Applikationen körs i minst två instanser, så att en enskild instans kan falla
  bort utan att tjänsten gör det.
- Databasen har en beredskapskopia som kan tas i bruk vid fel på den primära.
- Utgående utskick och integrationsanrop ligger i köer med omförsök och växande
  fördröjning. En störning hos ett anslutet system gör därför att uppgifter
  fördröjs, inte att de går förlorade.
- Vid störning i ett anslutet system fortsätter tjänsten fungera med de
  uppgifter som redan hämtats, och märker dem som inaktuella i gränssnittet i
  stället för att visa dem som aktuella.

Under planerat underhåll som kräver stopp underrättas beställaren minst fem
arbetsdagar i förväg, och arbetet läggs utanför kontorstid.
