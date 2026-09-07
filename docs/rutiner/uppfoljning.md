# Uppföljning och verifiering

Besvarar krav C.9.1–C.9.4.

## C.9.1 Redovisning av hur avtalade säkerhetskrav efterlevs

På beställarens begäran lämnas underlag inom tio arbetsdagar. Vad som finns att
visa:

| Krav det gäller | Underlag |
| --- | --- |
| Systematiskt säkerhetsarbete (C.1.1) | Protokoll från kvartals- och årsgenomgångar, riskförteckning |
| Sårbarhetshantering (C.1.2, C.6.7) | Förteckning över hanterade sårbarheter med klass, datum och åtgärd |
| Säkerhetstester (C.1.5) | Testrapporter, resultat av beroendegranskning, rapport från penetrationstest |
| Behörigheter (C.1.6) | Protokoll från halvårsgenomgången |
| Separering mellan kunder (C.1.12) | Resultat från kundsepareringstesterna, databasens policyer |
| Backup (C.8) | Protokoll från återställningsövningen med uppmätt tid |
| Incidenter (C.7) | Incidentförteckning och dokumentation för de som rört beställaren |
| Tillgänglighet (A.2.5) | `docs/tillganglighet.md`, samt rapport från oberoende granskning när den gjorts |
| Kravuppfyllnad | `docs/kravuppfyllnad.md`, rad för rad mot bilagan |

Underlag som innehåller uppgifter om andra kunder lämnas inte ut. Där sådant
skulle behövas lämnas i stället en sammanfattning eller ett intyg.

## C.9.2 Redovisning av genomförda åtgärder och förbättringar

En gång om året lämnas en säkerhetsredogörelse som täcker:

- vilka säkerhetsåtgärder som genomförts under året och varför,
- vilka incidenter som inträffat, hur de hanterats och vad de lett till,
- resultatet av årets säkerhetstester och återställningsövning,
- vilka sårbarheter som hanterats, fördelat på klass, och om tiderna hållits,
- vad som är planerat för kommande år.

Redogörelsen lämnas inför den årliga avstämningen med beställaren.

## C.9.3 Uppföljning i första hand på dokumentation

Uppföljningen bygger på det underlag som räknas upp ovan: dokumentation,
självdeklaration, testrapporter och protokoll. Det är tillräckligt för normal
uppföljning och kostar ingendera parten mer än nödvändigt.

Certifiering enligt ISO 27001 eller motsvarande finns **inte** vid tiden för det
här underlaget. Kan sådan komma att krävas behöver det avtalas särskilt, med tid
och kostnad för certifieringsarbetet.

Revision på plats sker bara i de fall som räknas upp i C.9.4.

## C.9.4 Medverkan vid uppföljning vid särskilda händelser

Leverantören medverkar vid en fördjupad uppföljning när något av följande
inträffar:

| Händelse | Vad uppföljningen omfattar |
| --- | --- |
| Större förändring av tjänsten | Genomgång av vad som ändrats, vilka säkerhetstester som gjorts och vilka risker som bedömts. |
| Allvarlig incident | Genomgång av förloppet, av vad som gjorde det möjligt, och av beslutade åtgärder. |
| Ny väsentlig underleverantör | Genomgång av vilken information underleverantören behandlar, var den behandlas, och vilka villkor som gäller. |

Beställaren kallar. Leverantören lämnar underlag senast fem arbetsdagar före
mötet, och de roller som berörs deltar.

**Väsentlig underleverantör** är en som behandlar beställarens information eller
kan påverka tjänstens tillgänglighet — driftplattform, backuplagring,
skanningstjänst, utskickstjänst. Byte av en sådan meddelas beställaren minst 30
dagar i förväg, med underlag nog för att beställaren ska kunna invända.

Underleverantörer som används vid tiden för det här underlaget listas i
[../arkitektur.md](../arkitektur.md). Förteckningen hålls uppdaterad.
