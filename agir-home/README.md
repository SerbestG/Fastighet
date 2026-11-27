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

## Sortimentet

Allt Plejd har, i Agir-tappning (Matter över Thread, så kunden kan blanda märken):

| Agir | Motsvarar hos Plejd | Bättre i Agir |
|---|---|---|
| Dosdimmer D1, Krondimmer D2 | DIM-01, DIM-02 | Dygnsrytm, timer, Agir släcker det som glömts |
| Relä R1, R2 2-pol | REL-01-2P, REL-02 | Timer (fläkten av om 15 min), Agir säger till när något står på i onödan |
| LED-driver L10, L75, LED-list | LED-10, LED-75, LST-01 | Ställbar färgton och dygnsrytm |
| DALI-brygga | DAL-01 | |
| Jalusi J1 | JAL-01 | |
| Termostat T1 | TRM-01 | Följer elpriset |
| Plugg P1, P2 dimmer | SPR-01, SPD-01 | Mäter effekt, "kaffebryggaren har stått på i 45 min" |
| Rörelsevakt M1 | WMS-01 | Tänder bara när det är mörkt, nattljus 23–06, släcker bara det den själv tände |
| Knapp K1, Vrid V1, Knappingång W1 | WPH-01, WRT-01, WIN-01 | Välj vad knappen gör direkt i appen |
| Downlight, Plafond, Vägglampa | DWN, CCL, OUT | |
| Agir Hub | GWY-01, EXT-01, BAT-01 | Thread-nätet förstärks av varje nätansluten enhet, batteribackup i hubben |

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
