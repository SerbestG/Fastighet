# Leverantörens rutiner

Kravspecifikationens avsnitt C innehåller 32 krav som inte kan uppfyllas av kod.
De handlar om hur leverantören arbetar: vilka rutiner som finns, vem som gör vad
och hur det går att följa upp. Ett anbud som svarar "ja" på dem behöver kunna
visa upp något.

Dokumenten i den här mappen är det underlaget. De är skrivna för att kunna
lämnas som bilaga till anbudet och för att fungera som faktiska arbetsrutiner
under avtalstiden.

## Så ska de läsas

Rutinerna beskriver hur den levererade tjänsten ska förvaltas. De är
**förslag som den anbudsgivande organisationen behöver anta och bemanna** —
en rutin är inte i kraft för att den är nedskriven. Där en rutin förutsätter en
roll, ett verktyg eller ett avtal som ännu inte finns står det utskrivet i
dokumentet, i stället för att formuleras som om det redan vore på plats.

Var sak som redan är byggd i produkten hänvisas till med filnamn, så att
påståendet går att kontrollera.

## Innehåll

| Dokument | Krav som besvaras |
| --- | --- |
| [sakerhetsarbete.md](sakerhetsarbete.md) | C.1.1–C.1.13 |
| [saker-utveckling.md](saker-utveckling.md) | C.6.1–C.6.7 |
| [loggning-och-overvakning.md](loggning-och-overvakning.md) | C.4.1–C.4.4 |
| [incidenthantering.md](incidenthantering.md) | C.7.1–C.7.5 |
| [backup-och-kontinuitet.md](backup-och-kontinuitet.md) | C.8.1–C.8.5 |
| [uppfoljning.md](uppfoljning.md) | C.9.1–C.9.4 |
| [ai-styrning.md](ai-styrning.md) | C.10.1–C.10.2 |

## Vem som gör vad

Rutinerna utgår från fyra roller. En person kan bära flera, men varje roll
behöver ha en namngiven innehavare och en namngiven ersättare innan tjänsten
sätts i drift.

| Roll | Ansvar |
| --- | --- |
| Tjänsteansvarig | Äger tjänsten som helhet. Beslutar om förändringar som påverkar avtalet, och är beställarens kontaktväg vid eskalering. |
| Säkerhetsansvarig | Äger säkerhetsarbetet, sårbarhetshanteringen och incidentrutinen. Beslutar om en incident ska rapporteras till beställaren. |
| Driftansvarig | Äger driftmiljön, backuperna, övervakningen och hemligheterna. |
| Utvecklingsansvarig | Äger kodbasen, kodgranskningen och releaseprocessen. |
