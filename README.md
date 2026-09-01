# Hemvist

Digital plattform för hyresgäster och fastighetsförvaltare.

Hemvist är dels hyresgästens app för hela boendet – felanmälan, ärenden, bokning,
avier, dokument, driftinformation och kommunikation – dels förvaltningens
operativa arbetsyta för att ta emot, fördela, följa upp och kommunicera. Samma
plattform betjänar flera fastighetsbolag samtidigt, med strikt separerad data.

---

## Kom igång

Förutsättningar: Node 20 eller senare och PostgreSQL 14 eller senare.

```bash
npm install

# Skapa databasen (en gång)
createdb hemvist

# Migreringar, applikationsroll och demodata
npm run db:reset

# Starta API och gränssnitt
npm run dev
```

API:et lyssnar på `http://localhost:4000` och gränssnittet på
`http://localhost:5173`.

### Demokonton

Alla demokonton har lösenordet `Demolosenord123!`. Personalkonton kräver dessutom
en engångskod; hemligheten finns i `users.mfa_secret` i demodata.

| Roll | Bolag | E-post |
| --- | --- | --- |
| Hyresgäst | Botkyrkabyggen | `robin.ek@example.com` |
| Medboende | Botkyrkabyggen | `maja.ek@example.com` |
| Administratör | Botkyrkabyggen | `anna.lindqvist@demo-botkyrkabyggen.se` |
| Fastighetsförvaltare | Botkyrkabyggen | `peter.ohlsson@demo-botkyrkabyggen.se` |
| Kundservice | Botkyrkabyggen | `sara.nyman@demo-botkyrkabyggen.se` |
| Fastighetsskötare | Botkyrkabyggen | `kemal.yildiz@demo-botkyrkabyggen.se` |
| Entreprenör | Ström & Rör AB | `tobias.strom@demo-stromochror.se` |
| Hyresgäst | Norrstaden | `karin.holm@example.com` |
| Administratör | Norrstaden | `marcus.sund@demo-norrstaden.se` |

De två bolagen finns med i demodata just för att gå att visa – och testa – att
ingen information läcker mellan dem.

---

## Kommandon

| Kommando | Vad det gör |
| --- | --- |
| `npm run dev` | Startar API och gränssnitt tillsammans |
| `npm run build` | Bygger alla paket |
| `npm run typecheck` | Typkontroll av samtliga paket |
| `npm test` | Kör alla tester |
| `npm run db:migrate` | Kör migreringar |
| `npm run db:seed` | Lägger in demodata |
| `npm run db:reset` | Tömmer, migrerar och seedar om |
| `npm run openapi -w @hemvist/api` | Skriver ut API-beskrivningen till `openapi.json` |
| `npm run e2e` | Går igenom hela användarresan i en webbläsare (se `e2e/README.md`) |

---

## Struktur

```
packages/
  shared/   Domänmodell, behörighetsmatris, kategoriträd, textkataloger, format
  api/      Fastify-API, databasmigreringar, bakgrundsjobb, tester
  web/      React-gränssnitt: hyresgästapp, personalvy, entreprenörsportal
e2e/        Genomgång av användarresan i webbläsare
docs/
  arkitektur.md              Teknisk uppbyggnad
  handbok-handlaggare.md     Handledning för handläggare och administratörer
  guide-hyresgast.md         Kort guide för hyresgäster
  sakerhet.md                Säkerhet, behörigheter och personuppgifter
  integrationer.md           Integrationsregister och vad som krävs
  kravuppfyllnad.md          Spårning mot Bilaga 3 Kravspecifikation
  infarandeplan.md           Införande, utbildning och acceptanstest
  systemdemonstration.md     Manus för de tre demonstrationsscenarierna
```

---

## Dokumentation

- [Handbok för handläggare](docs/handbok-handlaggare.md)
- [Guide för hyresgäster](docs/guide-hyresgast.md)
- [Arkitektur](docs/arkitektur.md)
- [Säkerhet och personuppgifter](docs/sakerhet.md)
- [Integrationer](docs/integrationer.md)
- [Kravuppfyllnad](docs/kravuppfyllnad.md)
- [Införandeplan](docs/infarandeplan.md)
- [Systemdemonstration](docs/systemdemonstration.md)

Ett maskinläsbart API-kontrakt finns på `/api/openapi.json` när servern kör.
