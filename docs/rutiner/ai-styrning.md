# AI och automatisering

Besvarar krav C.10.1–C.10.2.

## Utgångspunkt

Kravet är inte att AI ska undvikas, utan att den inte får fatta beslut som
påverkar hyresgäster eller verksamheten utan beställarens godkännande, och att
beställarens information inte får användas för att träna modeller.

Den enklaste vägen att uppfylla det är att inte ha någon språkmodell i något
beslutsled. Det är också vad som gäller i den levererade produkten.

## C.10.1 AI fattar inga beslut

**Ingen språkmodell finns i produkten.** Varken i ärendeflödet, i
prioriteringen, i utskicken eller i något annat som påverkar en hyresgäst.

Det som skulle kunna se ut som en bedömning är regelstyrt och läsbart:

| Vad | Hur det avgörs | Var |
| --- | --- | --- |
| Ärendets prioritet | Fasta regler ur svaren på följdfrågorna. Samma svar ger alltid samma prioritet. | `packages/shared/src/taxonomy.ts`, funktionen `derivePriority` |
| Om jourinformation ska visas | Ett svarsalternativ är märkt som eskalerande i taxonomin. | Samma fil |
| Vilket team ett ärende hamnar hos | Uppslag på kategori i en tabell beställaren själv styr. | `routing_rules` |
| Om en avi är förfallen | Jämförelse mot förfallodatum. | `packages/api/src/integrations/apply.ts` |
| Vilka som nås av ett utskick | Uppslag i fastighetsstrukturen. | `packages/api/src/core/audience.ts` |

Reglerna går att läsa, att testa och att ändra av beställaren. En bedömning från
en språkmodell hade varken varit läsbar eller upprepbar, och hade inte gått att
förklara för en hyresgäst som frågar varför.

## Om AI ska införas senare

Skulle beställaren vilja ha stöd av AI — förslag på svarstext till handläggare,
sammanfattning av ett långt ärende, kategoriförslag vid felanmälan — gäller
följande, och det ska avtalas innan något byggs:

1. **Beställaren godkänner varje användning skriftligen**, med vilken uppgift
   modellen ska utföra och vilken information den får se.
2. **AI föreslår, en människa beslutar.** Ett förslag visas för en handläggare
   som får godkänna, ändra eller förkasta det. Ingenting skickas till en
   hyresgäst utan att en människa sett det.
3. **Det ska synas att det är ett förslag**, både för handläggaren och i
   ärendets historik.
4. **Akutinformation berörs aldrig.** Jourtelefon och akuta råd är regelstyrda
   och får inte formuleras av en modell.
5. **Aldrig över kundgränsen.** En modell får aldrig se uppgifter från mer än
   den organisation ärendet tillhör.
6. **Går att stänga av.** Funktionen ska gå att slå av per organisation utan att
   något annat slutar fungera.

## C.10.2 Ingen träning på beställarens information

Information från beställaren, hyresgäster eller andra användare används inte för
att träna eller utveckla AI-modeller. Det gäller både egna modeller och modeller
hos någon annan.

Om en AI-funktion införs enligt ovan tillkommer:

- Leverantören ska visa att den valda leverantören av modellen inte använder
  inskickad information för träning, och att den inte sparas längre än vad
  bearbetningen kräver.
- Villkoret ska stå i avtalet med modelleverantören, inte bara i deras
  marknadsföring.
- Behandlingen ska framgå av personuppgiftsbiträdesavtalet, med uppgift om var
  behandlingen sker.
- Beställarens skriftliga godkännande krävs, och kan återkallas.

## Hur det går att kontrollera

Att ingen språkmodell finns i produkten går att verifiera: kodbasen har inget
beroende till någon modelleverantör, och inga utgående anrop utom till de system
som räknas upp i integrationsregistret.

```
$ grep -ril "openai\|anthropic\|gemini\|huggingface" packages/*/src
(inga träffar)
```
