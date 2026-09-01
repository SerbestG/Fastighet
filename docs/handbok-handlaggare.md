# Handbok för handläggare

Handledning för dig som arbetar i Hemvist på ett fastighetsbolag. Handboken följer
arbetsdagen snarare än menyerna.

---

## Logga in

Gå till adressen du fått, ange e-post och lösenord och därefter engångskoden från
din autentiseringsapp. Personalkonton kräver alltid engångskod.

**Första gången** visas en nyckel som du lägger till i din autentiseringsapp
(Microsoft Authenticator, Google Authenticator eller motsvarande). Skanna eller
skriv in nyckeln, ange koden appen visar, så är kontot klart.

Du loggas ut automatiskt efter 30 minuters inaktivitet. Byter du lösenord loggas
alla dina andra enheter ut.

**Du ser bara det du har behörighet till.** Är listan tom där du väntade dig
ärenden har du sannolikt inte fått ett område tilldelat ännu – hör av dig till
din systemadministratör.

---

## Översikten

Startsidan visar läget just nu: öppna, akuta och försenade ärenden, ej tilldelade,
svarstider, kundnöjdhet, vanligaste feltyper, ärenden per fastighet, kommande
besök och pågående driftstörningar.

**Varje tal går att klicka på.** Klickar du på *Akuta ärenden* öppnas
ärendeinkorgen med exakt de ärenden talet bygger på. Ingen siffra står för sig
själv.

Saknas underlag skrivs det ut i klartext i stället för att visa en nolla som ser
ut som ett mätvärde. Står det "Ingen återkoppling har lämnats ännu" betyder det
precis det.

---

## Ärendeinkorgen

### Hitta rätt

Sökfältet söker på ärendenummer, adress och ärendetext. Snabbfiltren ovanför
listan är de vanligaste urvalen: **Akuta**, **Försenade** och **Ej tilldelade**.
Statusmenyn filtrerar på ett enskilt läge.

### Fem sätt att se samma urval

| Vy | När den är användbar |
| --- | --- |
| **Lista** | Det dagliga arbetet. Mest information per rad. |
| **Tavla** | Morgonmötet. Visar var ärendena fastnar. |
| **Kalender** | Planering. Ärendena ligger på sitt sista åtgärdsdatum. |
| **Karta** | Ser var trycket finns geografiskt. |
| **Statistik** | Snabb fördelning på status och prioritet. |

### Arbeta med ett ärende

Öppna ärendet genom att klicka på raden.

**Överst** står hyresgästens beskrivning och svaren på följdfrågorna. Det svar som
gjorde ärendet akut är rödmarkerat – du behöver inte gissa varför ärendet
prioriterats.

**Märkningarna** talar om det praktiska: om huvudnyckel är godkänd, om det finns
husdjur, vilka tider hyresgästen kan ta emot besök och vilket telefonnummer som
gäller.

**Sidopanelen** innehåller åtgärderna:

- **Status** – bara lägen ärendet faktiskt kan gå till visas. Ett ärende kan inte
  hoppa från *Mottaget* direkt till *Avslutat*.
- **Tilldela** – välj handläggare. Ett ärende som tilldelas går automatiskt
  vidare från *Mottaget*.
- **Prioritet** – ändrar samtidigt svarstiderna.
- **Skapa arbetsorder** – skickar uppdraget till en entreprenör eller egen
  personal.

### Dialog och interna anteckningar

Under fliken **Dialog** finns två fält, och skillnaden är viktig:

| Fält | Vem ser det |
| --- | --- |
| **Svar till hyresgäst** | Hyresgästen, i appen. Hen får en notis. |
| **Intern anteckning** | Bara personal. Syns aldrig för hyresgästen. |

Interna anteckningar är streckade och gulmarkerade så att de går att skilja åt
med en blick. Kontrollen ligger i systemet, inte i gränssnittet – en intern
anteckning kan inte komma ut av misstag.

### När flera anmäler samma sak

Under fliken **Relaterade** listas liknande ärenden i samma byggnad den senaste
månaden. Kryssa i dubbletterna och välj *Slå ihop ärenden*.

De sammanslagna ärendena avslutas och kopplas till huvudärendet. **Varje
hyresgäst fortsätter få information i sitt eget ärende** – de märker inget av
sammanslagningen annat än att de får svar.

---

## Driftinformation och nyheter

### Skapa ett inlägg

*Driftinfo och nyheter → Nytt inlägg.*

1. **Typ och prioritet.** Typen styr om inlägget hamnar i driftflödet eller bland
   nyheterna. Prioriteten *Kritiskt* går alltid ut, även till den som stängt av
   notiser.
2. **Rubrik, sammanfattning och text.** Sammanfattningen är det som visas i
   listan och i notisen – skriv den så att den räcker som besked.
3. **Mottagare.** Välj i trädet: hela beståndet, ett område, en fastighet eller en
   byggnad. Flera nivåer går att välja samtidigt. **Antalet berörda hyresgäster
   räknas fram medan du väljer** – kontrollera det innan du publicerar.
4. **Tider.** Starttid, beräknad sluttid och nästa uppdatering visas för
   hyresgästen. Publiceringstid schemalägger inlägget. Avpubliceringstid tar bort
   det automatiskt.
5. **Kanaler och bekräftelse.** Kryssa i *Kräv att mottagaren bekräftar* när det
   är viktigt att veta att informationen nått fram.

**Förhandsgranska alltid.** Knappen visar inlägget precis som det ser ut i
hyresgästens app.

### Följa upp

Listan visar antal lästa och antal bekräftade per inlägg. Arkivfliken innehåller
tidigare inlägg att återanvända.

Ett publicerat inlägg tas aldrig bort – det arkiveras. Historiken ska finnas kvar.

---

## Bokningar

Fliken **Bokningar** visar de närmaste två veckorna. Fliken **Resurser** visar
tvättstugor, lokaler och besökstider med sina regler.

**Spärra tid** används vid underhåll eller driftstopp. Bokningar som ligger i den
spärrade tiden avbokas automatiskt, och **de berörda hyresgästerna får en notis
med din angivna anledning**. Skriv därför en anledning som går att läsa som den
är.

---

## Meddelanden

Trådar med olästa meddelanden ligger överst och är märkta *Nytt*. Samma skillnad
mellan svar och intern anteckning gäller här som i ärenden.

---

## Fastigheter och hyresgäster

**Fastigheter** visar hela strukturen: område, fastighet, byggnad, trapphus och
hyresobjekt, med hyresgäst och medboende per objekt.

**Hyresgäster** söker på namn, e-post och objektnummer. Knappen *Bjud in* skapar
en inbjudningskod till appen. **Koden visas en enda gång** – lämna den till
hyresgästen direkt. Den går inte att läsa ut i efterhand, bara ersätta med en ny.

---

## Vanliga frågor

**Varför kan jag inte sätta status till Avslutat?**
Ärendet måste passera *Klart* först, och du behöver behörighet att avsluta
ärenden. Statusmenyn visar bara lägen ärendet kan gå till.

**Varför ser jag inte ett störningsärende som en kollega nämner?**
Störnings- och trygghetsärenden är känsliga och kräver utökad behörighet. De
filtreras bort ur listan för den som saknar den.

**Hyresgästen säger att hen inte fått notisen.**
Kontrollera under *Integrationer* att kanalen är ansluten. Är push eller SMS inte
anslutet köas meddelandet och markeras som blockerat. Hyresgästen kan också ha
stängt av ämnet i sina notisinställningar – kritisk säkerhetsinformation går dock
alltid fram.

**Jag fick ett felmeddelande med ett spårnings-ID.**
Skicka ID:t till systemförvaltaren. Det pekar ut exakt vilket anrop som gick fel.

---

# Handbok för systemadministratörer

## Användare och behörighet

*Användare → Ny användare.* Ett tillfälligt lösenord visas **en gång**. Kontot
kräver tvåfaktorsautentisering vid första inloggningen.

**Roller** styr vad någon får göra:

| Roll | Kortfattat |
| --- | --- |
| Kundservice | Tar emot och fördelar, kan inte ändra beståndet |
| Fastighetsskötare | Arbetar med och avslutar ärenden |
| Tekniker | Utför arbete, avslutar ärenden |
| Uthyrare | Avtal, hyresgäster och dokument |
| Fastighetsförvaltare | Full ärendehantering, känsliga ärenden, publicering |
| Områdeschef | Som förvaltare, plus avier och användarlistan |
| Administratör | Allt ovan, plus inställningar, integrationer och säkerhetslogg |

**Behörighet till område** avgränsar vad personen ser. Utan tilldelning ser
personen ingenting – det är avsiktligt. Kundservice och administratörer arbetar
mot hela beståndet.

Ändrar du roller eller avgränsning **loggas användaren ut direkt**, så att den nya
behörigheten gäller omedelbart.

## Inställningar

**Profil.** Namn, primärfärg och accentfärg slår igenom i hela appen, även på
inloggningssidan.

**Begrepp mot kund.** Heter det Serviceanmälan hos er skriver du det här, så byts
ordet ut i hyresgästens app.

**Funktioner i appen.** Bocka av det ni inte vill visa. En avbockad modul
försvinner ur hyresgästens meny.

**Gallring.** Visar hur länge respektive datatyp sparas innan den raderas eller
anonymiseras. Bakgrundsjobbet följer reglerna automatiskt.

## Integrationer

Statusen speglar den faktiska anslutningen. En integration kan **inte** sättas
till *Ansluten* förrän adress och autentiseringsuppgifter finns – systemet
avvisar försöket, just för att listan aldrig ska visa en anslutning som inte
finns.

Funktioner som kräver en integration är avstängda tills den är ansluten. Det
gäller betalning i appen, digitala nycklar, BankID, organisationsinloggning och
förbrukningsdata.

## Säkerhetslogg

Loggen visar inloggningar, behörighetsändringar, ärendeåtgärder, publiceringar och
dataskyddsärenden, med aktör, IP-adress och utfall.

**Loggen går inte att ändra eller radera**, inte heller av en administratör.
Databasen tillåter bara att rader läggs till.

## Personuppgifter

En hyresgäst laddar själv ned sina uppgifter i profilen.

Vid begäran om radering registrerar du ett dataskyddsärende och genomför en
anonymisering. Namn, kontaktuppgifter och inloggningsuppgifter rensas, sessioner
avslutas. **Ärendehistorik och statistik behålls utan koppling till personen** –
förvaltningen kan följa upp arbetet, men uppgifterna finns inte kvar.
