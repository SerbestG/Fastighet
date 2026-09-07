# Incidenthantering

Besvarar krav C.7.1–C.7.5.

## C.7.1 Dokumenterad rutin

En säkerhetsincident är en händelse som påverkar tjänstens säkerhet,
tillgänglighet eller beställarens information. Misstanke räcker för att rutinen
ska starta — bedömningen görs sedan, inte innan.

### Steg

**1. Ta emot och registrera.** Den som upptäcker något meddelar
säkerhetsansvarig. Incidenten får ett nummer och en post med tidpunkt,
upptäckare och vad som setts. Posten fylls på under hela förloppet.

**2. Klassa.** Säkerhetsansvarig klassar inom en timme från upptäckt.

| Klass | Innebörd | Exempel |
| --- | --- | --- |
| A | Personuppgifter kan ha nåtts av obehörig, eller tjänsten är otillgänglig. | Läckt uppgift, dataintrång, längre driftstopp. |
| B | Säkerheten är försvagad men ingen information bedöms ha nåtts av obehörig. | Utnyttjad sårbarhet utan påvisad åtkomst, förlorad enhet med åtkomst. |
| C | Avvikelse utan omedelbar påverkan. | Felaktigt satt behörighet som upptäckts och rättats. |

**3. Begränsa.** Innan orsaken är utredd: stoppa spridningen. Återkalla sessioner
och integrationstoken, stäng av det konto eller den integration som berörs, sätt
föregående version i drift om felet ligger i en ny release.

**4. Underrätta beställaren.** Se C.7.2.

**5. Utred och åtgärda.** Fastställ vad som hänt, vilken information som berörts
och hur. Säkerhetsloggen är källan: den kan bara läsas och fyllas på, aldrig
ändras, vilket gör den användbar även när något gått fel.

**6. Återställ.** Sätt tjänsten i normalt läge. Kontrollera att det som
begränsades i steg 3 verkligen släppts när det inte längre behövs.

**7. Följ upp.** Inom tio arbetsdagar: en genomgång av vad som hände, vad som
gjorde det möjligt, vad som fungerade i hanteringen och vilka åtgärder som
beslutats. Genomgången söker orsaker i arbetssätt och teknik, inte hos personer.

## C.7.2 Rapportering till beställaren utan onödigt dröjsmål

| Klass | Första besked | Innehåll |
| --- | --- | --- |
| A | Inom 4 timmar från klassning | Vad som hänt, vilka uppgifter som kan ha berörts, vad som gjorts, när nästa besked kommer. |
| B | Inom 24 timmar | Detsamma. |
| C | I den månatliga driftrapporten | Sammanställning. |

Beskedet lämnas även när bilden är ofullständig. Ett tidigt besked med det som
är känt är mer användbart än ett fullständigt besked som kommer sent.

Rör incidenten personuppgifter är beställaren personuppgiftsansvarig och
beslutar om anmälan till Integritetsskyddsmyndigheten. Leverantören ska lämna
det underlag som behövs för den bedömningen, i tid för att beställaren ska
klara sin frist på 72 timmar. Beskedet ska därför innehålla: vilka kategorier av
personuppgifter som berörts, ungefär hur många personer, vilka konsekvenser som
kan uppstå och vilka åtgärder som vidtagits.

## C.7.3 Kontaktvägar och eskalering

| Läge | Kontakt | Svarstid |
| --- | --- | --- |
| Normal ärendegång | Leverantörens supportadress | Nästa arbetsdag |
| Säkerhetsincident, kontorstid | Säkerhetsansvarig, direkt | 1 timme |
| Säkerhetsincident, övrig tid | Beredskapsnummer | 1 timme |
| Eskalering | Tjänsteansvarig | 4 timmar |

Namn och nummer lämnas vid avtalstecknandet och hålls uppdaterade. Beställaren
lämnar på samma sätt sin kontakt för säkerhetsfrågor.

## C.7.4 Förmåga att hantera incidenter

- Rollerna i [README.md](README.md) har namngivna innehavare och ersättare.
- Beredskap utanför kontorstid enligt avtalad servicenivå.
- Åtgärderna i steg 3 går att utföra i tjänstens egna gränssnitt: sessioner kan
  återkallas, integrationskonton stängas av, token ogiltigförklaras.
- Incidentrutinen övas en gång om året (C.1.1). Övningen utgår från ett påhittat
  men realistiskt förlopp, och protokollet noterar vad som inte fungerade.

## C.7.5 Dokumentation och redovisning

Varje incident dokumenteras med: nummer, tidpunkt för upptäckt och för
klassning, klass, förlopp, berörd information, vidtagna åtgärder, tidpunkt för
återställning och beslutade förbättringar.

Beställaren får dokumentationen för incidenter som rört dem, och en
sammanställning av samtliga incidenter vid den årliga uppföljningen (C.9.2).
