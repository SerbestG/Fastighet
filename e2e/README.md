# Genomgång i webbläsare

Skripten kör hela användarresan i en riktig webbläsare mot en körande miljö och
sparar skärmbilder. De används dels som rökprov före leverans, dels för att ta
fram bilder till dokumentation och demonstration.

## Förutsättningar

```bash
npm install
npx playwright install chromium     # om ingen webbläsare redan finns
npm run db:reset
npm run dev                         # API på 4000, gränssnitt på 5173
```

Om Chromium redan finns på maskinen kan sökvägen anges i stället för att ladda
ned en ny:

```bash
export CHROMIUM_PATH=/sökväg/till/chrome
```

## Körning

```bash
node e2e/resident.mjs      # hyresgästens resa
node e2e/staff.mjs         # förvaltarens arbetsyta
node e2e/contractor.mjs    # entreprenörsportalen
```

Skärmbilder hamnar i `e2e/screenshots/`.

Skripten är avsiktligt läsbara snarare än kompakta: de går att följa steg för steg
vid en demonstration, och varje steg motsvarar ett moment i
[systemdemonstrationen](../docs/systemdemonstration.md).
