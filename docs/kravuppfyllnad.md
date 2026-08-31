# Kravuppfyllnad

Spårning mot *Bilaga 3. Kravspecifikation*. Varje krav som går att uppfylla i
produkten redovisas med var det är löst. Krav som handlar om leverantörens
rutiner snarare än om systemet redovisas som **Leverantörsrutin** – de kan inte
uppfyllas av kod och ska besvaras i anbudet.

## Sammanfattning

| Bedömning | Antal | Innebörd |
| --- | --- | --- |
| Uppfylld | 89 | Finns i den levererade produkten. |
| Delvis | 13 | Finns till större delen; det som återstår anges per krav. |
| Kräver konfiguration | 7 | Byggt och klart, men behöver adress och autentiseringsuppgifter. |
| Kräver avtal | 3 | Kräver avtal eller certifikat som ännu inte finns. |
| Leverantörsrutin | 32 | Rutin hos leverantören, inte en funktion i systemet. |
| Ej uppfylld | 1 | Inte löst. Rekommenderad åtgärd anges per krav. |

Totalt 145 krav med kravnummer i bilagan.

> Bilagan anger 157 krav totalt. Tabellen nedan omfattar de 145 rader som
> bär ett kravnummer i kalkylbladet; övriga rader är rubriker, definitioner eller
> krav utan eget nummer.

## A.1 Allmänna krav

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.1.1 | Ska | Systemet ska vara en molntjänst (Saas). | **Leverantörsrutin** | Applikationen är byggd för molndrift (statslös process, extern databas och fillagring). Själva driftleveransen ingår inte i kodbasen. |
| A.1.2 | Ska | Tjänsten ska ha ett administrationsgränssnitt i desktopmiljö. | **Uppfylld** | Administrationsgränssnitt för desktop, `packages/web/src/staff`. |
| A.1.3 | Ska | Tjänsten ska fungera utan att användaren behöver installera annan programvara utöver webläsaren. | **Uppfylld** | Rent webbgränssnitt, inga insticksmoduler. |
| A.1.4 | Ska | Anbudsgivaren ska offerera en mobilapplikation för hyresgäster. | **Delvis** | Hyresgästdelen är byggd mobil först och fungerar i mobil webbläsare. Paketering till App Store och Google Play återstår. |
| A.1.5 | Ska | Om någon systemanpassning som är unik för Beställaren är gjord ska den bevaras i framtida versioner. | **Uppfylld** | Kundunika anpassningar lagras som data per organisation (profil, begrepp, moduler, resurser, kategorier) – inte som kodgrenar – och följer därför med vid uppgradering. |
| A.1.6 | Ska | Med överföring avses alla fall där data transporteras eller förflyttas från leverantörens tjänst. Detta kan vara till ett annat system via till exe… | **Uppfylld** | Informationsfråga. Överföringar sker via API och loggas i `integration_events`. |
| A.1.7 | Ska | Tjänsten ska ha stöd för att dela data med externa system och tredje part via API:er enligt öppna format och standarder. | **Uppfylld** | JSON över HTTPS, beskrivet i OpenAPI 3.1 på `/api/openapi.json`. |
| A.1.8 | Ska | Tjänsten ska kunna integrera med Beställarens fastighetssystem (nuvarande Vitec) | **Kräver konfiguration** | Registrerad integration. Datamodellen bär objektnummer och externa referenser. Kräver API-nyckel och avtal om dataöverföring. |
| A.1.9 | Ska | Tjänsten ska kunna integrera med Beställarens boknings- och passersystem (nuvarande Aptus) | **Kräver konfiguration** | Registrerad integration. Passagepunkter och behörigheter finns i modellen. Kräver anslutningsavtal. |
| A.1.10 | Ska | Leverantören är ansvarig för att extern åtkomst till datamängder i systemet via API:er är säker och att obehöriga inte kan få åtkomst till data. | **Uppfylld** | Behörighet kontrolleras på objektnivå vid varje anrop, ovanpå Row Level Security i databasen. |
| A.1.12 | Ska | API ska leverera data i UTF-8. | **Uppfylld** | Alla svar i UTF-8. |
| A.1.13 | Ska | API ska logga alla anrop med tidsstämpel, IP-adress och användar-ID. | **Uppfylld** | `audit_log` och `integration_events` med tidpunkt, IP-adress, användare och spårnings-ID. |
| A.1.14 | Ska | Tjänsten API ska vara dokumenterade i OpenAPI-format och tillgängliga för UM och dess samarbetspartners. | **Uppfylld** | OpenAPI 3.1 genereras ur serverns verkliga ruttabell. |
| A.1.15 | Ska | API:et ska stödja OAuth 2.0 för autentisering och auktorisering. | **Delvis** | Bearer-token enligt OAuth 2.0-mönster för inloggade användare. Klientuppgifter för maskin-till-maskin (client credentials) konfigureras när första integrationen ansluts. |
| A.1.16 | Ska | Tjänsten ska ha stöd för responsiv design. | **Uppfylld** | Responsiv layout från 320 px till desktop. |

## A.2 Användbarhet

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.2.1 | Ska | Tjänsten ska ha möjlighet för att anpassa gränssnitt efter Beställarens grafiska design. | **Uppfylld** | Logotyp, primär- och accentfärg per organisation slår igenom i hela gränssnittet. |
| A.2.2 | Ska | Tjänstens gränssnitt inklusive dokumentation för Botkyrkabyggens anställda ska levereras på svenska och är anpassade efter svenska förhållanden. | **Uppfylld** | Gränssnitt och dokumentation på svenska. |
| A.2.5 | Ska | Tjänsten ska följa WCAG 2.1 till minst nivå AA. | **Delvis** | Byggt enligt WCAG 2.1 AA: fokusmarkeringar, tangentbordsnavigation, kopplade etiketter, status som inte bara bärs av färg, stöd för reducerad rörelse och hög kontrast. Extern tillgänglighetsgranskning återstår. |
| A.2.6 | Ska | Tjänsten gränssnitt ska ha inbyggda hjälptexter på svenska för användare samt kund/hyresgäst. | **Uppfylld** | Hjälptexter vid fält samt kunskapsartiklar som förvaltningen själv redigerar. |
| A.2.7 | Ska | Tjänsten ska vara utformat så att språkbruk, användargränssnitt, navigering, sparande, symboler och andra grafiska element används konsekvent och e… | **Uppfylld** | Gemensamt designsystem och gemensamma textkataloger för alla vyer. |
| A.2.8 | Ska | Menyer, dialoger, felmeddelande och liknande som kan förekomma i systemet ska vara på svenska. | **Uppfylld** | Samtliga meddelanden och felmeddelanden på svenska. |
| A.2.9 | Ska | Tjänsten ska visa datum och klockslag enligt vedertagen svensk standard (åååå-mm-dd respektive tt.mm enligt UTC(SP)). | **Uppfylld** | åååå-mm-dd och tt.mm, tidszon Europe/Stockholm. Verifierat med test. |
| A.2.10 | Ska | Hjälpfunktioner ska finnas tillgängliga direkt från Tjänsten. | **Uppfylld** | Hjälpartiklar nås direkt i appen via `/api/knowledge`. |
| A.2.11 | Ska | Botkyrkabyggen ska ha möjlighet att välja och ändra de begrepp som används i Tjänsten gentemot kund, till exempel felanmälan/serviceanmälan/ärende,… | **Uppfylld** | Egna begrepp per organisation, exempelvis Serviceanmälan i stället för Felanmälan. |

## A.3 Statistik

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.3.12 | Ska | Det skall gå att ta ut statistik över aktiva kunder i Tjänsten. | **Uppfylld** | `/api/staff/analytics/activity` visar aktiva kunder och inloggningar över tid. |
| A.3.13 | Bör | Det bör vara möjligt att visualisera statistik över utförda aktiviteter, totalt och per område (såsom antal inloggningar, antal bokningar etc, förd… | **Uppfylld** | Statistik per område och över tid i förvaltarens översikt. |
| A.3.14 | Bör | Det bör gå att ta ut statistik över hur många som har använt/klickat på respektive meny, enskilda nyheter mm, totalt samt uppdelat per område | **Delvis** | Läsning och bekräftelse per inlägg mäts och redovisas. Klick per menyval mäts inte. |

## A.4 Kompatibilitet och klienter

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.4.1 | Ska | Tjänsten ska stödja aktuella versioner (minst de två senaste) av webbläsarna Microsoft Edge och Google Chrome. Med aktuella versioner avses de vers… | **Uppfylld** | Bygget riktar sig mot ES2022; stöds av aktuella versioner av Edge och Chrome. |
| A.4.2 | Bör | Tjänsten bör stödja aktuella versioner (minst de två senaste) av webbläsaren Safari. Med aktuella versioner avses de versioner som leverantören av … | **Uppfylld** | Samma stöd i Safari. |
| A.4.3 | Ska | Tjänsten ska uppvisa full funktionalitet för användare på mobila enheter som smarta telefoner och surfplattor förutsatt att dessa stödjer gällande … | **Uppfylld** | Full funktionalitet på mobil och surfplatta. |
| A.4.6 | Ska | Mobilappen skall under hela avtalstiden stödja aktuell samt minst två majorversioner bakåt för IOS och fyra majorversioner bakåt för Android. | **Delvis** | Webbgränssnittet fungerar på de versionerna. Kravet i sin helhet förutsätter en publicerad mobilapplikation. |
| A.4.7 | Bör | Botkyrkabyggen bör kunna ha ett unikt namn på sin mobilapp i Google Play Store och App Store. | **Kräver konfiguration** | Namn och ikon sätts vid publicering i respektive butik. |

## A.5 Systemdokumentation

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.5.1 | Ska | Användardokumentationen ska vara på svenska. | **Delvis** | Teknisk dokumentation finns på svenska i `docs/`. Slutanvändarhandledning för handläggare återstår. |
| A.5.2 | Ska | Leverantören ska ge beställaren tillgång till fullständig systemdokumentation på svenska. | **Uppfylld** | Arkitektur, säkerhet, integrationer och kravuppfyllnad på svenska. |
| A.5.3 | Ska | Systemdokumentation, systemkonfigurationsdokumentation, användar- och driftdokumentation ska upprättas och uppdateras fortlöpande utan kostnad av l… | **Leverantörsrutin** | Dokumentationen ligger i samma versionshantering som koden och uppdateras med den. Åtagandet över avtalstiden är organisatoriskt. |
| A.5.4 | Ska | Dokumentation, användar- och systemdokumentation ska vara versionsstyrd och följa aktuell version av systemet. All dokumentation ska levereras digi… | **Uppfylld** | Versionsstyrd i git tillsammans med koden. |

## A.6 Backup

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.6.1 | Ska | Backuptagning ska kunna ske online. Det vill säga, att systemet inte behöver stängas ned för att backup ska kunna ske. | **Leverantörsrutin** | Onlinebackup av PostgreSQL sker i driftmiljön utan nedstängning. |

## A.7 Behörighet och identitetshantering

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| A.7.1 | Ska | Varje användare ska ha en unik identitet i systemet. | **Uppfylld** | Personliga konton med unik e-postadress per organisation. |
| A.7.3 | Ska | Systemadministratör ska kunna lägga till, ändra och ta bort användare. | **Uppfylld** | Administratör skapar, ändrar och spärrar användare. |
| A.7.4 | Ska | Systemadministratör ska kunna lägga till, ändra och ta bort en användares behörighetsinställningar och behörighetsroller. | **Uppfylld** | Roller och avgränsning till område eller fastighet ändras per användare. Ändring avslutar användarens sessioner. |
| A.7.6 | Ska | Tjänsten ska ge möjlighet till att styra åtkomst till olika funktioner, processer och information utifrån tilldelad behörighetsroll. | **Uppfylld** | Behörighetsmatris som kontrolleras i backend vid varje anrop. |

## B.1 Funktionella krav

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| B.1.1 | Bör | Medboende eller annan intressent bör kunna bjudas in till mobilapplikationen av kund. | **Uppfylld** | Hyresgästen bjuder in medboende med engångskod. |
| B.1.2 | Bör | Antal medboende eller annan intressent som kund kan bjuda in, bör kunna begränsas till maximalt en (1) person. | **Uppfylld** | Högst en medboende per bostad; kontrolleras i backend. |
| B.1.5 | Ska | Tjänsten ska ha funktion för att skicka push-notiser till kund. | **Kräver konfiguration** | Notiser skapas och köas med rätt mottagare och länkmål. Kräver nycklar för APNs och FCM. |
| B.1.6 | Ska | Tjänsten ska ha funktion för att visa notiser direkt i systemgränsnittet. | **Uppfylld** | Notiscentral i appen med olästmarkering. |
| B.1.7 | Ska | Kund ska kunna ställa in vilka notifikationer som är aktiva eller inte. | **Uppfylld** | Per ämne och kanal. Kritisk säkerhetsinformation kan inte stängas av. |
| B.1.8 | Ska | Det ska i administrationsgränssnitt vara möjligt att söka på fastighetsstruktur. | **Uppfylld** | Sökning på objektnummer, adress, fastighet och lägenhet. |
| B.1.9 | Ska | Det ska i administrationsgränssnitt vara möjligt att filtrera enligt fastighetsstruktur. | **Uppfylld** | Filtrering på område, fastighet och byggnad. |
| B.1.11 | Ska | Det ska vara möjligt för Botkyrkabyggen att välja vilka funktioner i offererad lösning som kunden får ta del av. | **Uppfylld** | Moduler slås på och av per organisation i inställningarna. |
| B.1.14 | Bör | Det bör finnas möjlighet att betala en hyresavi/faktura direkt i appen genom en integrerad betallösning. | **Kräver avtal** | Betalning i appen kräver avtal och integration. Appen påstår inte att betalning kan genomföras. |
| B.1.15 | Ska | Botkyrkabyggen ska kunna kommunicera med kunder via riktade inlägg/nyheter/notiser. Inläggen ska minst kunna styras på byggnadsnivå, fastighetsnivå… | **Uppfylld** | Publicering per område, fastighet och byggnad. Verifierat med test. |
| B.1.16 | Bör | Riktade inlägg/nyheter/notiser bör kunna läggas upp för kunder baserat på mindre enheter än byggnad, t.ex. trappuppgång, stam, enskild lägenhet. | **Uppfylld** | Även trapphus, enskild lägenhet och enskilt avtal. |
| B.1.17 | Ska | Botkyrkabyggens handläggare ska kunna välja att publicera informationen samtidigt för flera områden/fastigheter/byggnader. | **Uppfylld** | Flera nivåer kan väljas samtidigt för samma inlägg. |
| B.1.18 | Ska | Botkyrkabyggens handläggare ska kunna schemalägga inlägg/anslag/nyheter som läggs in att visas vid senare tidpunkt. | **Uppfylld** | Schemalagd publicering; bakgrundsjobb publicerar och skickar notiser. |
| B.1.19 | Ska | Botkyrkabyggens handläggare ska kunna förinställa in en tidpunkt då inlägg/anslag/nyheter avpubliceras. | **Uppfylld** | Avpubliceringstid som bakgrundsjobbet verkställer. |
| B.1.20 | Bör | Botkyrkabyggens handläggare bör kunna fästa viktiga inlägg/anslag/nyheter överst i flödet t.o.m ett angivet datum. | **Uppfylld** | Inlägg kan fästas överst till och med ett angivet datum. |
| B.1.21 | Ska | Det ska i administrationsgränssnittet finnas möjlighet att använda en editor där Botkyrkabyggens handläggare kan utforma meddelandet/inlägget/nyhet… | **Uppfylld** | Redigering av rubrik, sammanfattning, text och bild. |
| B.1.22 | Bör | Det bör i administrationsgränssnittet finnas en sammanställning/arkiv som visar tidigare inlägg/anslag/nyheter – för spårning samt kopiering/återan… | **Uppfylld** | Arkiv med publicerade, schemalagda och avpublicerade inlägg samt läskvitton. |
| B.1.23 | Bör | Det bör i administrationsgränssnittet gå att förhandsgranska inlägg/nyhet/ information i "appläge" innan publicering. | **Uppfylld** | Förhandsgranskning som visar inlägget så som det ser ut i appen. |
| B.1.24 | Bör | Kunder bör i appen kunna se och följa sin förbrukning av el och vatten förutsatt att detta mäts i kundens hyresobjekt. | **Kräver avtal** | Kräver mätvärdesinsamling per objekt. Funktionen visas inte förrän mätvärden finns. |
| B.1.25 | Ska | Kunder ska i appen kunna hitta kontaktinformation till Botkyrkabyggen. | **Uppfylld** | Kontaktsida med kundservice, fastighetsjour och störningsjour. |
| B.1.26 | Ska | Det ska vara möjligt för Botkyrkabyggens handläggare att spegla utvalt informationsinnehåll från Botkyrkabyggens webbplats till appen. | **Delvis** | Innehåll kan läggas in som kunskapsartiklar med källadress. Automatisk spegling från webbplatsen kräver konfiguration. |
| B.1.27 | Bör | Kunder bör själva kunna redigera viss personlig information (t.ex. e-post, telefonnummer), och de nya uppgifterna ska i sådana fall även läggas in … | **Delvis** | Hyresgästen ändrar e-post och telefon. Överföring till fastighetssystemet sker när integrationen är ansluten; tills dess får användaren tydligt besked. |
| B.1.28 | Ska | Kunder ska kunna skapa felanmälningar och övriga typer av ärenden som finns definierade i fastighetssystemet. | **Uppfylld** | Felanmälan, störningsärende, övrig begäran och besiktning. |
| B.1.31 | Ska | Kund ska kunna bifoga text och bild i felanmälan. | **Uppfylld** | Text, bilder, film och PDF, med kontroll av filens verkliga innehåll. |
| B.1.32 | Bör | Det bör vara möjligt att automatiskt i systemet skala ned de bilder som kunden bifogar i sin felanmälan. | **Ej uppfylld** | Bilder lagras som de laddas upp. Storleksgräns per fil finns (25 MB). Nedskalning bör läggas till före produktionssättning. |
| B.1.33 | Ska | Det ska finnas möjlighet för kunder att skapa fler typer av ärenden utöver felanmälan. Varje ärendetyp ska sedan kunna skickas till en fördefiniera… | **Uppfylld** | Fördelningsregler styr ärendetyp och område till rätt handläggargrupp. |
| B.1.34 | Ska | Kund ska kunna se en översikt över sina felanmälningar och övriga ärenden samt aktuell status för respektive ärende (ej påbörjad, påbörjad eller av… | **Uppfylld** | Ej påbörjad, påbörjad och avslutad för hyresgästen, med detaljerad status internt. |
| B.1.35 | Bör | Det bör vara möjligt att kommunicera i löpande inlägg mellan hyresgäst och handläggare i enskilt ärende. Hyresgäst ska kunna få notis i appen då de… | **Uppfylld** | Löpande dialog i ärendet med notis vid nytt meddelande. Interna anteckningar visas aldrig för hyresgästen. |
| B.1.36 | Ska | Kund ska kunna boka resurser som Botkyrkabyggen tillhandahåller, såsom tvättstuga. | **Uppfylld** | Tvättstuga, gemensamhetslokal, bastu, gästlägenhet, parkering, besök, besiktning och nyckelhämtning. |
| B.1.37 | Ska | Bokningsresurser ska minst kunna vara unika per område, fastighet eller byggnad. | **Uppfylld** | Resurser knyts till område, fastighet eller byggnad. |
| B.1.38 | Bör | Bokningsresurser bör kunna läggas upp för mindre enheter än byggnad, t.ex. trappuppgång, stam, enskild lägenhet. | **Uppfylld** | Även trapphus och enskild lägenhet. |
| B.1.39 | Ska | Vid bokning av resurser ska kund kunna se ett schema med bokningsbara tider. | **Uppfylld** | Schema med lediga, bokade, spärrade och egna tider. |

## C.1 Generella IT-säkerhetskrav

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.1.1 | Ska | Leverantören ska bedriva ett dokumenterat och systematiskt säkerhetsarbete anpassat till tjänstens risknivå. | **Leverantörsrutin** |  |
| C.1.2 | Ska | Leverantören ska ha dokumenterade rutiner för hantering av säkerhetsbrister och säkerhetsuppdateringar. | **Leverantörsrutin** |  |
| C.1.3 | Ska | Leverantören ska regelbundet uppdatera och underhålla lösningen under avtalstiden. | **Leverantörsrutin** |  |
| C.1.4 | Ska | Leverantören ska arbeta enligt etablerad god praxis för säker utveckling och webbsäkerhet, exempelvis OWASP eller motsvarande. | **Uppfylld** | Parametriserade frågor, validering av all indata, säkra svarshuvuden, hastighetsbegränsning, kontroll av uppladdat innehåll och behörighet på objektnivå. |
| C.1.5 | Ska | Leverantören ska genomföra återkommande säkerhetstester eller motsvarande kontroller av lösningen. | **Leverantörsrutin** |  |
| C.1.6 | Ska | Leverantören ska ha rutiner för säker hantering av administratörs- och supportåtkomst. | **Leverantörsrutin** |  |
| C.1.7 | Ska | Leverantören ska ha tekniska och organisatoriska skydd mot skadlig kod i de delar av tjänsten som leverantören ansvarar för. | **Leverantörsrutin** |  |
| C.1.8 | Ska | Leverantören ska ha kontrollerad hantering av säkerhetsrelevanta konfigurationer i tjänsten och dess driftmiljö. | **Leverantörsrutin** |  |
| C.1.9 | Ska | Leverantören ska ha rutiner för att testa, godkänna och vid behov återställa ändringar som påverkar tjänsten. | **Leverantörsrutin** |  |
| C.1.10 | Ska | Leverantören ska säkerställa att större förändringar i tjänsten föregås av relevanta tester innan de införs i produktionsmiljö. | **Leverantörsrutin** |  |
| C.1.11 | Ska | Leverantören ska ha aktuell dokumentation över tjänstens tekniska huvudkomponenter, integrationer och driftmodell. | **Uppfylld** | Dokumenterat i `docs/arkitektur.md` och `docs/integrationer.md`. |
| C.1.12 | Ska | Leverantören ska säkerställa att beställarens information hålls logiskt eller fysiskt separerad från andra kunders information. | **Uppfylld** | Logisk separation med Row Level Security. Verifierat med test som bevisar att en organisation inte når en annans rader. |
| C.1.13 | Ska | Leverantören ska tillhandahålla en testmiljö där nya funktioner, integrationer och förändringar kan testas innan de införs i produktionsmiljö. | **Leverantörsrutin** | Testmiljö sätts upp i driftleveransen; koden stödjer separata miljöer via miljövariabler. |

## C.2 Identitet och åtkomst

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.2.1 | Ska | Hyresgäster ska autentiseras med BankID eller annan stark autentisering som godkänts av beställaren. | **Kräver avtal** | BankID är förberett. Kräver avtal och produktionscertifikat. Fram till dess används verifierad e-postadress och lösenord. |
| C.2.2 | Ska | Lösningen ska koppla autentiserad hyresgäst till rätt kund-, boende- eller avtalsinformation i fastighetssystemet. | **Uppfylld** | Kopplingen mellan konto och hyresförhållande finns i `tenancy_residents`; personnummer matchas via nyckelbunden hash. |
| C.2.3 | Ska | Lösningen ska säkerställa att användare endast får åtkomst till information och funktioner som de är behöriga till. | **Uppfylld** | Behörighet kontrolleras i tre lager. Verifierat med test. |
| C.2.4 | Ska | Administrativa användare hos beställaren ska kunna logga in med federerad inloggning och SSO via Microsoft Entra ID. | **Kräver konfiguration** | OpenID Connect mot Entra ID. Kräver appregistrering i kundens katalog. |
| C.2.5 | Ska | Lösningen ska stödja federerad inloggning mot Microsoft Entra ID genom etablerade standarder, exempelvis SAML 2.0 eller OpenID Connect. | **Kräver konfiguration** | Samma som ovan. |
| C.2.6 | Ska | Samtliga administrativa användare hos beställaren ska kunna omfattas av beställarens krav på multifaktorautentisering genom federerad inloggning el… | **Uppfylld** | Tvåfaktor är obligatorisk för personalkonton och kan inte förbigås. |
| C.2.7 | Ska | Leverantörens administrativa konton och supportkonton med åtkomst till tjänsten eller beställarens information ska skyddas med MFA eller motsvarand… | **Leverantörsrutin** |  |
| C.2.8 | Ska | Lösningen ska stödja roll- och behörighetsstyrning för administrativa användare. | **Uppfylld** | Roll- och behörighetsstyrning med avgränsning till område och fastighet. |
| C.2.9 | Ska | Inloggningar och administrativa åtgärder ska loggas och spåras. | **Uppfylld** | Inloggningar och administrativa åtgärder loggas i den oföränderliga säkerhetsloggen. |
| C.2.10 | Ska | Sessioner för minst adminstratörer ska avslutas efter inaktivitet. Beskriv hur kravet uppfylls. | **Uppfylld** | 30 minuters inaktivitet för personal, 14 dagar för hyresgäster. Verifierat med test. |
| C.2.11 | Ska | Konton med administrativa eller utökade behörigheter ska skyddas med MFA. | **Uppfylld** | Samtliga personalroller omfattas. |
| C.2.12 | Ska | Icke-personliga konton, exempelvis system-, service- och integrationskonton, ska begränsas till nödvändiga behörigheter och skyddas mot obehörig an… | **Delvis** | Integrationskonton refererar hemligheter via `secret_ref` och begränsas per integration. Sätts upp när första integrationen ansluts. |
| C.2.13 | Ska | Lösningen ska uppdatera eller avsluta hyresgästens åtkomst när kund-, boende- eller avtalsrelationen ändras i fastighetssystemet. | **Uppfylld** | Bakgrundsjobb avslutar behörigheter när boendeförhållandet upphör. |

## C.3 Integrationer och API-säkerhet

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.3.1 | Ska | All kommunikation mellan lösningen och externa system, API:er och integrationskomponenter ska vara krypterad med TLS 1.2 eller högre, eller motsvar… | **Uppfylld** | TLS terminieras före applikationen; HSTS sätts i produktionsläge. |
| C.3.2 | Ska | API:er och integrationer ska kräva autentisering. Användarnamn, lösenord, tokens, API-nycklar eller motsvarande autentiseringsuppgifter får inte la… | **Uppfylld** | Hemligheter lagras aldrig i klartext och filtreras bort ur både loggar och säkerhetslogg. Verifierat med test. |
| C.3.3 | Ska | Integrationer ska endast ha åtkomst till den information och de funktioner som krävs för tjänsten. | **Uppfylld** | Varje integration begränsas till den information den behöver. |
| C.3.4 | Ska | Lösningen ska kunna logga integrationsanrop och relevanta förändringar mellan lösningen och verksamhetssystemet. | **Uppfylld** | `integration_events`, append-only. |
| C.3.5 | Ska | Leverantörens lösning ska hantera integrationsfel, avbrott och återkommande felaktiga anrop på ett kontrollerat sätt, så att tjänsten och anslutna … | **Uppfylld** | Utgående meddelanden köas med försöksräknare; fel påverkar inte övriga funktioner. |
| C.3.6 | Ska | Lösningen ska säkerställa att användare endast kan läsa och påverka information som de är behöriga till. | **Uppfylld** | Verifierat med test för både läsning och skrivning. |
| C.3.7 | Ska | Information som skickas mellan appen och verksamhetssystem ska kunna kopplas till relevant användare, funktion eller händelse. | **Uppfylld** | Varje integrationshändelse bär användare, objekt och korrelations-ID. |
| C.3.8 | Ska | Information ska valideras innan data skickas till verksamhetssystemet. | **Uppfylld** | All indata valideras med scheman innan den sparas eller skickas vidare. |
| C.3.9 | Ska | Lösningen ska kunna logga förändringar och händelser som skickas till eller från verksamhetssystemet. | **Uppfylld** | Samma logg som C.3.4. |
| C.3.10 | Ska | Lösningen ska säkerställa att information mellan appen och verksamhetssystemet hålls uppdaterad. | **Kräver konfiguration** | Uppdatering sker vid ansluten integration. |
| C.3.11 | Ska | Lösningen ska kunna hantera tillfälliga fördröjningar, avbrott, misslyckade uppdateringar eller tillfälliga integrationsstörningar mellan appen och… | **Uppfylld** | Kön hindrar att ofullständig information skrivs vidare vid avbrott. |
| C.3.12 | Ska | Om lokal cache används ska cachelagrad information skyddas mot obehörig åtkomst och raderas när den inte längre behövs. | **Uppfylld** | Åtkomsttoken ligger i `sessionStorage` och försvinner när fliken stängs. Filsvar sätts till `no-store`. |
| C.3.13 | Ska | Användaren ska informeras på ett tydligt sätt om en åtgärd inte kan genomföras eller om information inte är uppdaterad. | **Uppfylld** | Fellägen visar begripligt meddelande, spårnings-ID och möjlighet att försöka igen. Utebliven uppdatering mot fastighetssystemet redovisas för användaren. |
| C.3.14 | Ska | Lösningen ska kontrollera behörighet på objekt- och funktionsnivå vid relevanta API-anrop, så att användare inte kan läsa, ändra eller skapa inform… | **Uppfylld** | Kontroll på objektnivå vid varje anrop, plus Row Level Security. Verifierat med test. |

## C.4 Loggning och spårbarhet

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.4.1 | Ska | Lösningen ska logga säkerhetsrelaterade händelser, administrativa åtgärder, inloggningar och integrationshändelser. | **Uppfylld** | Säkerhetslogg och integrationslogg. |
| C.4.2 | Ska | Loggar ska skyddas mot obehörig åtkomst och manipulation. | **Uppfylld** | Loggarna är append-only i databasen; applikationsrollen saknar UPDATE och DELETE. Verifierat med test. |
| C.4.3 | Ska | Leverantören ska kunna bistå beställaren med relevanta loggar vid incident eller felsökning. | **Uppfylld** | Loggen kan filtreras och läsas ut i administrationsgränssnittet. |
| C.4.4 | Ska | Leverantören ska ha övervakning eller motsvarande förmåga för att upptäcka säkerhetsincidenter och avvikande beteenden i tjänsten. | **Leverantörsrutin** | Beredskapskontroll finns på `/api/health/ready`; övervakningen driftsätts av leverantören. |

## C.5 Mobil- och klientsäkerhet

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.5.1 | Ska | Appen ska utvecklas och testas med hänsyn till etablerad god praxis för mobilappssäkerhet, exempelvis OWASP MASVS eller motsvarande. | **Delvis** | Webbklienten följer etablerad praxis. En bedömning enligt OWASP MASVS förutsätter en publicerad mobilapplikation. |
| C.5.2 | Ska | Skyddsvärd information får inte lagras okrypterat på mobil enhet. | **Uppfylld** | Ingen skyddsvärd information lagras beständigt i klienten. |
| C.5.3 | Ska | Skyddsvärd information ska inte exponeras i notifieringar, pushnotiser, cache, lokala loggar eller andra klientnära funktioner om det inte är nödvä… | **Uppfylld** | Pushnotiser innehåller bara en kort inledning, aldrig ärendets innehåll. |
| C.5.4 | Ska | Kommunikation mellan app och backend ska vara krypterad. | **Uppfylld** | All kommunikation över TLS. |
| C.5.5 | Ska | Appen ska verifiera certifikat vid kommunikation mot backend och API:er. | **Delvis** | Webbläsarens certifikatkontroll gäller. Certifikatnålning läggs till i en native app. |
| C.5.6 | Ska | Om lösningen tillåter uppladdning av filer eller bilder ska dessa hanteras på ett säkert sätt. Godkända filtyper och filstorlekar ska kunna begräns… | **Delvis** | Filtyp och storlek begränsas, filens verkliga innehåll kontrolleras och åtkomsten prövas vid varje nedladdning. Extern virusskanning återstår. |

## C.6 Säker utveckling och teknisk förändring

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.6.1 | Ska | Leverantören ska begränsa åtkomst till egenutvecklad kod, kundspecifika anpassningar, byggmiljöer och utvecklingsverktyg till behöriga personer. | **Leverantörsrutin** |  |
| C.6.2 | Ska | Källkod och konfigurationer som används för tjänsten ska hanteras med versionskontroll eller motsvarande spårbar hantering. | **Uppfylld** | All kod och konfiguration i git. |
| C.6.3 | Ska | Leverantören ska säkerställa att utvecklings-, test- och produktionsmiljöer är separerade. | **Leverantörsrutin** | Miljöerna styrs av miljövariabler och separata databaser. |
| C.6.5 | Ska | Leverantören ska ha möjlighet att återställa eller korrigera ändringar som orsakar allvarliga fel eller säkerhetsproblem i tjänsten. | **Uppfylld** | Versionshantering och kontrollerade migreringar; migreringar med ändrad kontrollsumma avvisas. |
| C.6.6 | Ska | Leverantören ska genomföra relevanta säkerhetstester vid större förändringar som påverkar tjänstens säkerhet, åtkomst, integrationer eller externa … | **Leverantörsrutin** |  |
| C.6.7 | Ska | Leverantören ska ha rutiner för att hantera upptäckta sårbarheter i egen kod, tredjepartskomponenter och driftmiljö. | **Leverantörsrutin** |  |

## C.7 Incidenthantering

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.7.1 | Ska | Leverantören ska ha dokumenterade rutiner för hantering av säkerhetsincidenter. | **Leverantörsrutin** |  |
| C.7.2 | Ska | Säkerhetsincidenter som påverkar tjänsten, beställarens information eller integrationer ska rapporteras till beställaren utan onödigt dröjsmål. | **Leverantörsrutin** |  |
| C.7.3 | Ska | Leverantören ska tillhandahålla kontaktvägar för incidenthantering och eskalering. | **Leverantörsrutin** |  |
| C.7.4 | Ska | Leverantören ska kunna hantera incidenter som påverkar tjänstens säkerhet eller tillgänglighet. | **Leverantörsrutin** |  |
| C.7.5 | Ska | Leverantören ska dokumentera säkerhetsincidenter som påverkar tjänsten och kunna redovisa relevanta åtgärder för beställaren. | **Leverantörsrutin** |  |

## C.8 Backup, kontinuitet och återställning

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.8.1 | Ska | Leverantören ska ha dokumenterade rutiner för backup och återställning. | **Leverantörsrutin** |  |
| C.8.2 | Ska | Backuper ska skyddas mot obehörig åtkomst. | **Leverantörsrutin** |  |
| C.8.3 | Ska | Leverantören ska regelbundet testa återställning av backup eller motsvarande återställningsförmåga. | **Leverantörsrutin** |  |
| C.8.4 | Ska | Leverantören ska övervaka tjänstens kapacitet och prestanda i syfte att upptäcka störningar och säkerställa avtalad tillgänglighet. | **Delvis** | Beredskapskontroll och körningslogg för bakgrundsjobb finns. Kapacitetsövervakning sätts upp i driftmiljön. |
| C.8.5 | Ska | Leverantören ska ha förmåga att hantera driftstörningar i de delar av tjänsten som krävs för att upprätthålla avtalad tillgänglighet. | **Leverantörsrutin** |  |

## C.9 Uppföljning och verifiering

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.9.1 | Ska | Leverantören ska på begäran kunna redovisa dokumentation som visar hur avtalade säkerhetskrav efterlevs. | **Leverantörsrutin** |  |
| C.9.2 | Ska | Leverantören ska kunna redovisa genomförda säkerhetsåtgärder och förbättringar som är relevanta för tjänsten. | **Leverantörsrutin** |  |
| C.9.3 | Ska | Uppföljning ska i första hand baseras på dokumentation, självdeklarationer, standardiserade underlag, certifieringar, revisioner eller motsvarande. | **Leverantörsrutin** |  |
| C.9.4 | Ska | Leverantören ska medverka vid uppföljning av säkerhetskrav vid större förändring, allvarlig incident eller införande av ny väsentlig underleverantör. | **Leverantörsrutin** |  |

## C.10 AI och automatisering

| Krav | Typ | Innehåll | Bedömning | Kommentar |
| --- | --- | --- | --- | --- |
| C.10.1 | Ska | AI-funktioner får inte användas för att fatta beslut eller ge automatiserade rekommendationer som påverkar hyresgäster, ärenden eller Botkyrkabygge… | **Uppfylld** | Plattformen fattar inga beslut med språkmodeller. Prioritering och statusflöden är deterministiska regler, verifierade med test. |
| C.10.2 | Ska | Information från beställaren, hyresgäster eller andra användare får inte användas för träning eller generell utveckling av AI-modeller utan beställ… | **Uppfylld** | Ingen kunddata lämnar plattformen för modellträning. |
