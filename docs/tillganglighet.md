# Tillgänglighetsgranskning

Automatisk granskning med axe-core mot wcag2a, wcag2aa, wcag21a, wcag21aa.
Kördes 2026-09-08 över 33 vyer i alla tre gränssnitten.

Granskningen körs om med `node e2e/accessibility.mjs` mot en igångvarande miljö.

## Resultat

Inga fel funna i någon vy.

## Granskade vyer

- Inloggning (/logga-in) — inga fel
- Hyresgäst · Startsidan (/) — inga fel
- Hyresgäst · Ärenden (/arenden) — inga fel
- Hyresgäst · Ny felanmälan (/arenden/nytt) — inga fel
- Hyresgäst · Boka (/boka) — inga fel
- Hyresgäst · Avier (/avier) — inga fel
- Hyresgäst · Dokument (/dokument) — inga fel
- Hyresgäst · Mitt boende (/mitt-boende) — inga fel
- Hyresgäst · Driftinfo (/driftinfo) — inga fel
- Hyresgäst · Meddelanden (/meddelanden) — inga fel
- Hyresgäst · Flytt (/flytt) — inga fel
- Hyresgäst · Enkäter (/enkater) — inga fel
- Hyresgäst · Området (/omradet) — inga fel
- Hyresgäst · Kontakt (/kontakt) — inga fel
- Hyresgäst · Notiser (/notiser) — inga fel
- Hyresgäst · Profil (/profil) — inga fel
- Hyresgäst · Mer (/mer) — inga fel
- Personal · engångskod (/logga-in) — inga fel
- Personal · Översikt (/) — inga fel
- Personal · Ärendeinkorg (/arenden) — inga fel
- Personal · Arbetsorder (/arbetsorder) — inga fel
- Personal · Meddelanden (/meddelanden) — inga fel
- Personal · Driftinfo (/) — inga fel
- Personal · Bokningar (/bokningar) — inga fel
- Personal · Fastigheter (/fastigheter) — inga fel
- Personal · Hyresgäster (/hyresgaster) — inga fel
- Personal · Avier (/avier) — inga fel
- Personal · Enkäter (/enkater) — inga fel
- Personal · Användare (/anvandare) — inga fel
- Personal · Integrationer (/integrationer) — inga fel
- Personal · Säkerhetslogg (/sakerhetslogg) — inga fel
- Personal · Inställningar (/installningar) — inga fel
- Entreprenör · arbetsorder (/) — inga fel

## Vad granskningen inte täcker

Automatisk granskning fångar ungefär en tredjedel av kraven i WCAG. Bedömningar
som kräver en människa — om en alternativtext beskriver rätt sak, om ordningen i
ett formulär är begriplig, om ett felmeddelande går att förstå — ingår inte.
En oberoende granskning av en tillgänglighetsexpert kvarstår därför.
