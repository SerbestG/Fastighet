# Integrationer

## Statusens innebörd

Integrationsregistret visar den faktiska anslutningen, inte att ett gränssnitt
finns. Statusen sätts av konfiguration och anslutningskontroll.

| Status | Innebörd |
| --- | --- |
| **Ansluten** | Adress och autentiseringsuppgifter finns och anslutningen fungerar. Funktioner som bygger på integrationen är påslagna. |
| **Testmiljö** | Anslutning mot leverantörens testmiljö. Inte i produktion. |
| **Kräver konfiguration** | Avtal finns eller är på plats, men adress och/eller uppgifter saknas. |
| **Frånkopplad** | Har varit ansluten men är avstängd. |
| **Planerad** | Kräver avtal eller certifikat som ännu inte finns. |

En integration kan **inte** sättas till *Ansluten* från gränssnittet förrän både
adress och registrerade autentiseringsuppgifter finns – servern avvisar försöket.
Det gör att listan inte kan visa en anslutning som inte existerar.

## Register vid leverans

| Integration | Typ | Status | Vad som krävs |
| --- | --- | --- | --- |
| Vitec Hyra | Fastighetssystem | Kräver konfiguration | API-nyckel och avtal om dataöverföring |
| Aptus | Passersystem | Kräver konfiguration | Anslutningsavtal och teknisk konfiguration |
| Aptus bokning | Bokningssystem | Kräver konfiguration | Aktiveras tillsammans med passersystemet |
| Microsoft Entra ID | Federerad inloggning | Kräver konfiguration | Appregistrering i kundens katalog |
| E-postutskick | E-post | Kräver konfiguration | SMTP-uppgifter eller leverantörsnyckel |
| Pushnotiser | Push | Kräver konfiguration | Nycklar för APNs och FCM |
| Ekonomisystem | Ekonomi | Kräver konfiguration | Anslutningsuppgifter |
| Hyresavisering | Avisering | Testmiljö | Övergång till produktion |
| Kartunderlag | Kartor | Ansluten | Öppna kartdata, ingen nyckel krävs |
| Extern kalender | Kalender | Ansluten | ICS-export, ingen extern tjänst krävs |
| BankID | Identitet | Planerad | Avtal med BankID-leverantör och produktionscertifikat |
| SMS-utskick | SMS | Planerad | Avtal med SMS-operatör |
| Betallösning | Betalningar | Planerad | Avtal och teknisk integration |
| Digital signering | Signering | Planerad | Avtal med signeringsleverantör |
| Digitala lås | Lås | Planerad | Avtal och teknisk integration |
| Entreprenörssystem | Entreprenör | Planerad | Avtal per entreprenör |
| Mätvärden el och vatten | Mätning | Planerad | Mätvärdesinsamling per objekt |
| Identitetsverifiering | Identitet | Planerad | Avtal med leverantör |
| Kundserviceplattform | Kundservice | Frånkopplad | Ny anslutning vid behov |

## Vad som är avstängt tills en integration är ansluten

Detta är kärnan i att appen inte lovar mer än den håller:

| Funktion | Beroende | Vad hyresgästen ser i dag |
| --- | --- | --- |
| Betalning i appen | Betallösning | Betalningsuppgifter med OCR och bankgiro, och beskedet att betalning i appen inte är aktiverad |
| Digitala nycklar | Passersystem eller digitala lås | Vilka passagepunkter som hör till bostaden, och att digitala nycklar visas när integrationen är ansluten |
| Inloggning med BankID | BankID | Knappen visas inte; en rad förklarar att inloggningssättet aktiveras när integrationen är ansluten |
| Organisationsinloggning | Entra ID | Samma sak för personalen |
| Digital signering av dokument | Signering | Dokument går att läsa och ladda ner; signering är markerad men inte möjlig |
| Förbrukning av el och vatten | Mätvärden | Funktionen visas inte alls hellre än att visa tomma grafer |
| Utgående e-post och SMS | E-post, SMS | Meddelandet köas och markeras som blockerat; det syns i driftvyn att det inte gick fram |
| Överföring av ändrade kontaktuppgifter | Fastighetssystem | Uppgiften sparas i plattformen och användaren får beskedet att den ännu inte förts vidare |

## Integrationsarkitektur

Utgående anrop loggas i `integration_events` med tidpunkt, riktning, slutpunkt,
svarskod, svarstid, korrelations-id och eventuellt fel. Loggen är append-only,
precis som säkerhetsloggen, och ger den spårbarhet som krävs för avstämning
(krav C.3.4, C.3.9, A.1.13).

Autentiseringsuppgifter lagras aldrig i `integrations.config`. Där ligger enbart
icke-hemliga inställningar; hemligheter refereras via `secret_ref` mot
driftmiljöns hemlighetshantering (krav C.3.2).

Utgående meddelanden går genom `outbound_queue` med försöksräknare och
felmeddelande. En integration som är nere leder därmed inte till förlorade
meddelanden, och tjänsten fortsätter fungera i övrigt (krav C.3.5, C.3.11).

## API för andra system

API:et beskrivs i OpenAPI 3.1 och genereras ur serverns verkliga ruttabell, så att
beskrivningen inte kan glida isär från det API som körs.

```bash
npm run openapi -w @hemvist/api        # skriver openapi.json
curl http://localhost:4000/api/openapi.json
```

Allt svaras i UTF-8. Datum och tider anges i ISO 8601 med tidszon, belopp i ören
som heltal.

Inloggade användare autentiseras med Bearer-token. För maskin-till-maskin-anrop
utfärdas separata klientuppgifter enligt OAuth 2.0 client credentials, vilket
konfigureras när den första integrationen ansluts (krav A.1.15).
