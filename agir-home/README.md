# Agir Home

Styr hela hemmet från telefonen: ljus, golvvärme, lås, larm, persienner, laddbox, kameror och läckagevakter. Installerbar webbapp (PWA), byggd mobil först.

## Kom igång

```bash
cd agir-home
npm install
npm run dev
```

## Lägg ut på Vercel

1. Nytt projekt i Vercel → välj repot.
2. **Root Directory:** `agir-home` (resten läses från `vercel.json`).
3. Varje push till grenen byggs automatiskt.

Öppna adressen i Safari på iPhone → Dela → **Lägg till på hemskärmen**. På Android: menyn → **Installera app**. Håll inne ikonen för genvägarna Godnatt, Jag går nu och Fråga Agir.

## Struktur

```
src/
  devices/      Enhetslagret. UI:t pratar bara med DeviceAdapter.
    types.ts            gränssnittet (DeviceAdapter, DeviceState)
    mockAdapter.ts      låtsasenheter, sparas i telefonen
    homeAssistantAdapter.ts  REST + WebSocket mot Home Assistant
    index.ts            väljer källa
  home/         Planlösningen (rum, fönster, enheternas placering) och scener
  state/        App-tillstånd och härledda värden (effekt, temperatur, elpris)
  agir/         Agirs förslag (insights) och kommandotolken (intents)
  components/   3D-huset, dragreglaget, pills, korten
  screens/      De 14 skärmarna
```

## Koppla in Home Assistant

Sätt miljövariablerna i Vercel (eller `.env.local`):

```
VITE_DEVICE_SOURCE=ha
VITE_HA_URL=https://ditt-hem.duckdns.org
VITE_HA_TOKEN=<long-lived access token>
```

Matcha sedan entiteterna i `src/devices/homeAssistantAdapter.ts` (`ENTITY_MAP`). Inget i UI:t behöver ändras. Obs: en token i en webbapp syns för den som har appen – det är okej för ett eget hem men inte för kunder. Till Agir Hub byggs en egen adapter med samma gränssnitt, där inloggningen sköts av hubben.
