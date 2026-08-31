# Arkitektur

## Översikt

```
  Hyresgästens app            Personalens arbetsyta        Entreprenörsportal
  (mobil först)               (desktop)                    (mobil först)
         │                            │                            │
         └────────────────────────────┴────────────────────────────┘
                                      │  HTTPS, JSON, UTF-8
                            ┌─────────▼──────────┐
                            │   Hemvist API      │  Fastify, TypeScript
                            │  behörighet, SLA,  │
                            │  notiser, jobb     │
                            └─────────┬──────────┘
                                      │  SQL, en anslutning per transaktion
                            ┌─────────▼──────────┐
                            │    PostgreSQL      │  Row Level Security per bolag
                            └─────────┬──────────┘
                                      │
                        ┌─────────────┴─────────────┐
                        │  Integrationer (utgående) │
                        │  fastighetssystem, passer,│
                        │  ekonomi, e-post, SMS…    │
                        └───────────────────────────┘
```

Tre gränssnitt, ett API, en databas. Gränssnitten delar designsystem och
textkataloger men har helt skilda vyer och navigationer, eftersom en hyresgäst
och en handläggare gör helt olika saker.

## Paket

**`packages/shared`** innehåller det som måste vara identiskt i både klient och
server: rollernas behörigheter, kategoriträdet för felanmälan med följdfrågor,
statusflödet, valideringsscheman och textkatalogerna. Att prioriteringsregeln bor
här är avsiktligt – appen kan visa jourinformation direkt i formuläret, och
servern räknar om samma sak innan ärendet sparas.

**`packages/api`** är ett Fastify-API i TypeScript. SQL skrivs direkt mot
`pg` med parametriserade frågor, utan mellanliggande ORM. Skälet är att
kundsepareringen bygger på databasnivån: varje transaktion sätter organisationen
och Row Level Security avgör vad som är synligt. Ett lager som döljer
anslutningen skulle göra den kopplingen svårare att lita på.

**`packages/web`** är ett React-gränssnitt byggt med Vite. Designsystemet är
skrivet i vanlig CSS med designtokens, utan ramverk, så att bolagens egna färger
kan slå igenom överallt genom att byta två variabler.

## Kundseparering

Isoleringen ligger i tre lager:

1. **Databasen.** Varje tabell med kunddata har `org_id` och en Row
   Level Security-policy som jämför mot `app.current_org()`. Applikationen
   ansluter med rollen `hemvist_app`, som varken är superuser eller har
   `BYPASSRLS`. En fråga utan villkor returnerar därför noll rader i stället för
   någon annans data.
2. **Transaktionen.** `withOrg()` öppnar en transaktion, sätter organisationen
   med `SET LOCAL` och kör arbetet. Värdet gäller bara transaktionen, så en
   återanvänd anslutning kan aldrig bära med sig fel organisation.
3. **Anropet.** Varje slutpunkt kontrollerar roll, behörighet och – för
   handläggare – vilka områden och fastigheter personen har tilldelats.

Servern startar inte om lager ett saknas: `verifyTenantIsolation()` kontrollerar
vid uppstart att databasanvändaren inte kringgår policyerna och att ingen tabell
med `org_id` saknar Row Level Security.

Tre uppslag sker innan organisationen är känd – inloggning, e-postbekräftelse och
förnyelse av session – och går via avgränsade `SECURITY DEFINER`-funktioner som
enbart returnerar vilken organisation en uppgift hör till, aldrig kunddata.

## Datamodell i korthet

Fastighetsstrukturen är hierarkisk: **område → fastighet → byggnad → trapphus →
hyresobjekt**. Vyn `unit_hierarchy` plattar ut kedjan, vilket gör att en
publicering, en bokningsbar resurs eller en passagepunkt kan riktas mot vilken
nivå som helst med samma villkor.

Ett **hyresförhållande** (`tenancies`) binder ett hyresobjekt till en eller flera
boende (`tenancy_residents`, med rollerna hyresgäst och medboende). Det är
hyresförhållandet som avgör vad en inloggad hyresgäst ser – inte användarkontot i
sig.

**Ärenden** bär hela kedjan – avtal, objekt, byggnad, fastighet, område – redan
när de skapas. Det gör både behörighetskontroll och statistik till enkla frågor
utan sammanslagningar i flera led.

Belopp lagras i **ören som heltal** för att undvika avrundningsfel. Tider lagras
som `timestamptz` och visas enligt svensk standard (åååå-mm-dd, tt.mm).

## Ärendets väg

```
Hyresgäst väljer plats, kategori och underkategori
        │
        ▼
Följdfrågor från kategoriträdet besvaras
        │
        ▼  derivePriority() – ren regel, ingen språkmodell
Prioritet: akut / hög / normal / låg
        │
        ├── akut ──► jourinformation visas direkt i formuläret
        ▼
Ärendet sparas: löpnummer per bolag, SLA-tider, fördelning till handläggargrupp
        │
        ▼
Tidslinje och notis till hyresgästen
```

Statusövergångar är definierade i `CASE_TRANSITIONS` och kontrolleras i backend.
Ett försök att hoppa från *Mottaget* direkt till *Avslutat* avvisas med
konfliktsvar – flödet kan inte kringgås genom att anropa API:et direkt.

## Notiser

Varje notis hör till ett ämne som hyresgästen själv styr per kanal. Kritisk
säkerhetsinformation är undantagen och går alltid ut. Dubbletter hindras av en
unik nyckel per användare, kanal och händelse.

Utgående e-post, SMS och push läggs i `outbound_queue`. Saknas en fungerande
integration markeras raden som blockerad i stället för att tyst försvinna, och
notisen får status *misslyckad*. Det syns då i driftvyn att meddelandet inte gick
fram – vilket är hela poängen med att inte visa något som fungerande innan det är
det.

## Bakgrundsjobb

Jobben körs i en slinga i API-processen och är idempotenta – en omstart mitt i en
körning ger inga dubbla utskick.

| Jobb | Vad det gör |
| --- | --- |
| `publish_scheduled_notices` | Publicerar schemalagda inlägg och skickar notiser |
| `unpublish_expired_notices` | Arkiverar inlägg som passerat sin avpubliceringstid |
| `send_scheduled_broadcasts` | Skickar schemalagda utskick |
| `send_booking_reminders` | Påminner om bokningar inom ett dygn |
| `mark_overdue_invoices` | Markerar obetalda avier som förfallna |
| `expire_access_grants` | Avslutar behörigheter vid utgång och avslutat boende |
| `revoke_expired_sessions` | Avslutar sessioner som gått ut eller varit inaktiva |
| `apply_retention` | Gallrar enligt reglerna i `retention_policies` |

## Filhantering

Filer sparas utanför webbroten under en slumpad nyckel per organisation.
Innehållet kontrolleras mot både angiven filtyp och filens verkliga inledande
byte innan den sparas – en PHP-fil som utger sig för att vara en PNG avvisas.
Nedladdning sker alltid genom API:et, som kontrollerar behörigheten vid varje
hämtning. En filreferens ensam ger ingen åtkomst.

## Prestanda

Frågorna är indexerade efter de vägar gränssnittet faktiskt använder: ärenden per
status, prioritet, fastighet, byggnad och avtal, samt fritextsökning med
trigram-index. Dubbelbokning hindras av en uteslutningsregel i databasen i stället
för av en kontroll i koden, vilket gör två samtidiga bokningsförsök säkra utan
extra lås.

## Val vi gjort och varför

**Ingen ORM.** Kundsepareringen bygger på att veta exakt vilken anslutning som
kör vilken fråga i vilken transaktion. Direkt SQL gör det synligt.

**Ingen extern komponentsamling i gränssnittet.** Bolagens grafiska profil ska slå
igenom fullt ut, och kraven på tillgänglighet och tomlägen är specifika. Ett eget,
litet designsystem gav både bättre kontroll och mindre kod att underhålla.

**Egen implementation av lösenordshash, JWT och TOTP** ovanpå `node:crypto` i
stället för fler beroenden. Ytan är liten, väl testad och minskar antalet
tredjepartskomponenter som måste bevakas för sårbarheter.
