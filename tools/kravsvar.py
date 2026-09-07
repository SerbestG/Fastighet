"""
Svar på kravspecifikationen, rad för rad.

Bilagans svarskolumn tillåter bara Ja eller Nej. Den binära formen döljer
skillnaden mellan ett krav som är byggt och prövat, ett som vilar på en rutin,
och ett som väntar på uppgifter eller avtal. Därför bär varje rad här också en
kategori, som skrivs ut i kommentaren i bilagan och redovisas i sin helhet i
docs/kravuppfyllnad.md.

Kategorierna:

  UPPFYLLD      Finns i den levererade produkten och går att kontrollera.
  RUTIN         Leverantörens arbetssätt. Dokumenterat i docs/rutiner/.
  KONFIGURATION Byggt och klart, men behöver adress och autentiseringsuppgifter
                från beställaren eller dess systemleverantör.
  AVTAL         Kräver avtal eller certifikat som ännu inte finns.
  LEVERANS      Åtagande som fullgörs under införandet, inte i den kod som
                finns i dag.
"""

UPPFYLLD = 'Uppfylld'
RUTIN = 'Leverantörsrutin'
KONFIGURATION = 'Kräver konfiguration'
AVTAL = 'Kräver avtal'
LEVERANS = 'Ingår i leveransen'

# id -> (kategori, kommentar)
SVAR: dict[str, tuple[str, str]] = {
    # ----------------------------------------------------------- A.1 ---
    'A.1.1': (LEVERANS, 'Tjänsten levereras som molntjänst. Driftplattform upphandlas inför driftsättning, med krav på behandling inom EU/EES. Se docs/arkitektur.md.'),
    'A.1.2': (UPPFYLLD, 'Administrationsgränssnitt för desktop, packages/web/src/staff.'),
    'A.1.3': (UPPFYLLD, 'Rent webbgränssnitt utan insticksmoduler. Kan installeras på hemskärmen men kräver ingen installation.'),
    'A.1.4': (LEVERANS, 'Hyresgästdelen är byggd mobil först, kan installeras på hemskärmen och startar utan täckning. Paketering som app i App Store och Google Play ingår i leveransen och är inte genomförd.'),
    'A.1.5': (UPPFYLLD, 'Kundunika anpassningar lagras som data per organisation (profil, begrepp, moduler, resurser, kategorier), inte som kodgren, och följer därför med vid uppgradering.'),
    'A.1.6': (UPPFYLLD, 'All överföring sker via API:et och registreras i integration_events med riktning, utfall och tidpunkt.'),
    'A.1.7': (UPPFYLLD, 'JSON över HTTP enligt OpenAPI 3.1, med OAuth 2.0 för maskin-till-maskin. Inga proprietära format.'),
    'A.1.8': (KONFIGURATION, 'Synkroniseringsmotor med markör, färskhet och omförsök samt adapter mot Vitec med dokumenterad fältavbildning (src/integrations/vitec.ts). Kräver adress, API-nyckel och avtal om dataöverföring.'),
    'A.1.9': (KONFIGURATION, 'Passagepunkter, behörigheter och bokningsresurser finns i datamodellen, och behörigheter kan återkallas och loggas. Adaptern mot Aptus byggs efter samma mönster som fastighetssystemet när anslutningsavtal och teknisk konfiguration finns.'),
    'A.1.10': (UPPFYLLD, 'Extern åtkomst sker med OAuth 2.0 och scope-begränsade konton. Kundsepareringen ligger i databasen och gäller även maskinkonton, vilket prövas av test.'),
    'A.1.12': (UPPFYLLD, 'All utdata är UTF-8. Svenska tecken prövas i testsviten.'),
    'A.1.13': (UPPFYLLD, 'Varje anrop loggas med tidsstämpel, IP-adress, sökväg, svarskod och användar- eller klientidentitet. Authorization-huvudet tas bort innan raden skrivs.'),
    'A.1.14': (UPPFYLLD, 'OpenAPI 3.1 genereras ur den verkliga rutttabellen: 106 sökvägar, 127 anrop. Hämtas på /api/openapi.json.'),
    'A.1.15': (UPPFYLLD, 'Tokenendpoint enligt RFC 6749 med client_credentials, introspektion enligt RFC 7662 och återkallande enligt RFC 7009. Tolv tester.'),
    'A.1.16': (UPPFYLLD, 'Responsiv från 320 px. Hyresgästdelen är byggd mobil först, förvaltningen för desktop.'),
    'A.1.17': (KONFIGURATION, 'Fältavbildning för kundnummer, namn, adress, telefon, e-post och personnummer finns i src/integrations/vitec.ts. Personnumret lagras bara som pepprad hash. Kräver anslutning enligt A.1.8.'),
    'A.1.18': (KONFIGURATION, 'Medboende hanteras i datamodellen och ingår i avbildningen. Kräver anslutning enligt A.1.8.'),
    'A.1.19': (KONFIGURATION, 'Objektnummer, benämning, adress, medboende, avtalsstart, tidigaste utflytt och dokument ingår i avbildningen. Kräver anslutning enligt A.1.8.'),
    'A.1.20': (KONFIGURATION, 'Avtal, period, bankgiro, OCR, förfallodatum och belopp ingår i avbildningen. Kräver anslutning enligt A.1.8.'),

    # ----------------------------------------------------------- A.2 ---
    'A.2.1': (UPPFYLLD, 'Färger, logotyp och begrepp sätts per organisation i administrationsgränssnittet och slår igenom i hela appen.'),
    'A.2.2': (UPPFYLLD, 'Gränssnitt och dokumentation på svenska, med svenska datum- och talformat.'),
    '(onumrerad)': (UPPFYLLD, 'Hyresgästen byter språk till engelska i profilen. Även driftinformation och utskick lagras i båda språken, inte bara etiketterna.'),
    'A.2.5': (UPPFYLLD, 'Automatisk granskning med axe-core över 33 vyer mot WCAG 2.1 A och AA ger noll fel, se docs/tillganglighet.md. Oberoende granskning av tillgänglighetsexpert kvarstår och ingår i leveransen.'),
    'A.2.6': (UPPFYLLD, 'Hjälptexter vid fält och steg, samt förklarande text vid varje felkategori i felanmälan.'),
    'A.2.7': (UPPFYLLD, 'Ett gemensamt designsystem med samma komponenter, samma sparbeteende och samma symboler i alla tre gränssnitten.'),
    'A.2.8': (UPPFYLLD, 'Menyer, dialoger och felmeddelanden är på svenska och skrivna för att gå att förstå utan förkunskap.'),
    'A.2.9': (UPPFYLLD, 'Datum som åååå-mm-dd och klockslag som tt.mm, i svensk tidszon. Ett test kontrollerar att bokade tider ligger inom öppettiderna.'),
    'A.2.10': (UPPFYLLD, 'Hjälp nås från appen, och handledningarna finns i docs/guide-hyresgast.md och docs/handbok-handlaggare.md.'),
    'A.2.11': (UPPFYLLD, 'Begreppen sätts per organisation i inställningarna och används genomgående i gränssnittet.'),

    # ----------------------------------------------------------- A.3 ---
    'A.3.12': (UPPFYLLD, 'Aktiva kunder räknas på faktiska inloggningar under vald period, i förvaltningens översikt.'),
    'A.3.13': (UPPFYLLD, 'Användning redovisas totalt och per område, fördelat över tid. Registreringen sker med en pseudonym som byts varje dygn, så ingen enskild person går att följa.'),
    'A.3.14': (UPPFYLLD, 'Antal användare per meny, vy och enskild nyhet, totalt och per område.'),

    # ----------------------------------------------------------- A.4 ---
    'A.4.1': (UPPFYLLD, 'Byggs för de två senaste versionerna av Edge och Chrome. Genomgångarna i e2e/ körs i Chromium.'),
    'A.4.2': (UPPFYLLD, 'Samma standarder som för Edge och Chrome, utan webbläsarspecifik kod.'),
    'A.4.3': (UPPFYLLD, 'Full funktionalitet på telefon och surfplatta. Hela hyresgästresan körs i genomgången på 390 px bredd.'),
    'A.4.6': (LEVERANS, 'Gäller de nativa apparna, som paketeras under införandet. Versionsstödet blir ett åtagande i förvaltningen. Webbappen har inget motsvarande beroende.'),
    'A.4.7': (LEVERANS, 'Namn och ikon sätts vid publicering i respektive butik.'),

    # ----------------------------------------------------------- A.5 ---
    'A.5.1': (UPPFYLLD, 'docs/guide-hyresgast.md och docs/handbok-handlaggare.md, båda på svenska.'),
    'A.5.2': (UPPFYLLD, 'docs/arkitektur.md, docs/integrationer.md, docs/sakerhet.md samt rutinerna i docs/rutiner/.'),
    'A.5.3': (RUTIN, 'Dokumentationen ändras i samma ändring som koden, och granskas tillsammans med den. Se docs/rutiner/saker-utveckling.md.'),
    'A.5.4': (UPPFYLLD, 'All dokumentation ligger i samma versionshantering som koden och följer därmed versionen. Levereras digitalt.'),

    # ----------------------------------------------------------- A.6 ---
    'A.6.1': (RUTIN, 'Backup tas online med pg_dump och kontinuerlig arkivering av transaktionsloggen. Tjänsten behöver inte stängas av. Se docs/rutiner/backup-och-kontinuitet.md.'),

    # ----------------------------------------------------------- A.7 ---
    'A.7.1': (UPPFYLLD, 'Varje användare har ett eget konto. Icke-personliga konton är av typen service och kan inte logga in som människor.'),
    'A.7.3': (UPPFYLLD, 'Administratören lägger till, ändrar och avslutar användare i administrationsgränssnittet. Varje åtgärd hamnar i säkerhetsloggen.'),
    'A.7.4': (UPPFYLLD, 'Roller och avgränsning till område eller fastighet sätts per användare.'),
    'A.7.6': (UPPFYLLD, 'Elva roller med en rättighetsmatris som kontrolleras i backend vid varje läsning, ändring och filhämtning. Elva tester prövar rollgränserna.'),

    # ----------------------------------------------------------- B.1 ---
    'B.1.1': (UPPFYLLD, 'Hyresgästen bjuder in en medboende från Mitt boende och får en kod att lämna vidare.'),
    'B.1.2': (UPPFYLLD, 'Högst en medboende per bostad. Gränsen kontrolleras på servern och räknar även väntande inbjudningar.'),
    'B.1.3': (UPPFYLLD, 'Medboende bär samma uppgifter som hyresgästen och kopplas till samma objektnummer.'),
    'B.1.4': (UPPFYLLD, 'Objektnummer, namn, adress, telefon, e-post och personnummer hanteras. Personnumret lagras bara som pepprad hash.'),
    'B.1.5': (UPPFYLLD, 'Webbpush med kryptering enligt RFC 8291 och signering enligt RFC 8292, utan extern leverantör. APNs och FCM tillkommer för de nativa apparna.'),
    'B.1.6': (UPPFYLLD, 'Notiser visas i appen med olästmarkering, och ligger kvar så att informationen går att hitta i efterhand.'),
    'B.1.7': (UPPFYLLD, 'Kunden styr kanal per ämne. Kritisk säkerhetsinformation kan inte stängas av, vilket framgår i gränssnittet.'),
    'B.1.8': (UPPFYLLD, 'Sökning i fastighetsstrukturen med fritext över område, fastighet, byggnad och objekt.'),
    'B.1.9': (UPPFYLLD, 'Filtrering på område, fastighet, byggnad och trapphus i ärendeinkorgen och i mottagarurvalet.'),
    'B.1.10': (UPPFYLLD, 'Objektnummer, benämning, adress och boende visas per hyresobjekt i förvaltningsvyn.'),
    'B.1.11': (UPPFYLLD, 'Moduler slås på och av per organisation i inställningarna, och gränssnittet döljer det som är avstängt.'),
    'B.1.12': (UPPFYLLD, 'Avtalsstart, tidigaste utflytt, planlösning och dokument visas under Mitt boende. Uppgifterna kommer från fastighetssystemet när det är anslutet.'),
    'B.1.13': (UPPFYLLD, 'Avtal, period, bankgiro, OCR, förfallodatum, belopp och betalstatus visas. Förfallen räknas fram ur förfallodatum.'),
    'B.1.14': (AVTAL, 'Betalning i appen kräver avtal med betalleverantör. Appen påstår inte att betalning går att göra, utan visar bankgiro och OCR. Integrationen byggs när avtalet finns.'),
    'B.1.15': (UPPFYLLD, 'Utskick riktas på hyresgäst, lägenhet, trapphus, byggnad, fastighet, område eller alla, och visas för alla som ingår i urvalet.'),
    'B.1.16': (UPPFYLLD, 'Trapphus och enskild lägenhet ingår i mottagarurvalet.'),
    'B.1.17': (UPPFYLLD, 'Flera områden, fastigheter och byggnader kan väljas samtidigt, och antalet berörda räknas upp innan publicering.'),
    'B.1.18': (UPPFYLLD, 'Publicering kan schemaläggas. Ett bakgrundsjobb publicerar vid rätt tidpunkt.'),
    'B.1.19': (UPPFYLLD, 'Avpubliceringstidpunkt kan sättas i förväg och verkställs av samma jobb.'),
    'B.1.20': (UPPFYLLD, 'Inlägg kan fästas överst till och med ett angivet datum.'),
    'B.1.21': (UPPFYLLD, 'Editor med rubrik, text och bild, på svenska och engelska.'),
    'B.1.22': (UPPFYLLD, 'Arkiv över tidigare inlägg med publiceringstidpunkt, mottagarurval och lästal.'),
    'B.1.23': (UPPFYLLD, 'Förhandsgranskning i appläge visas i samma formulär, före publicering.'),
    'B.1.24': (AVTAL, 'Förbrukning visas först när mätvärden kan hämtas. Det kräver både mätning i objektet och avtal med mätvärdesleverantör. Ingenting visas dessförinnan.'),
    'B.1.25': (UPPFYLLD, 'Kontaktvägar med telefon, e-post, öppettider och journummer, per organisation.'),
    'B.1.26': (UPPFYLLD, 'Handläggaren pekar ut en sida på bolagets webbplats. Innehållet rensas med tillåtandelista, granskas och publiceras därefter.'),
    'B.1.27': (UPPFYLLD, 'Kunden ändrar e-post och telefon själv. Ändringen läggs i utgående kö och skickas till fastighetssystemet, även om det är otillgängligt just då.'),
    'B.1.28': (UPPFYLLD, 'Felanmälan och tre ytterligare ärendetyper. Vilka som finns styrs av beställaren och kan speglas mot fastighetssystemets uppsättning.'),
    'B.1.29': (UPPFYLLD, 'Bostaden, övriga kontraktsobjekt och allmänna utrymmen väljs utifrån kundens avtal.'),
    'B.1.30': (UPPFYLLD, 'Utrymme, feltyp, beskrivning, husdjur och tillträde med nyckel finns i felanmälan. Uppsättningen styrs av beställaren och kan hämtas från fastighetssystemet vid anslutning.'),
    'B.1.31': (UPPFYLLD, 'Text och bild kan bifogas. Bilder skalas ned i telefonen innan uppladdning.'),
    'B.1.32': (UPPFYLLD, 'Nedskalning till 2048 px sker i webbläsaren. En 24 MB kamerabild blev 1 MB i verklig körning, en minskning med 96 procent.'),
    'B.1.33': (UPPFYLLD, 'Fler ärendetyper finns, och varje typ styrs till rätt grupp av handläggare med regler beställaren själv sätter.'),
    'B.1.34': (UPPFYLLD, 'Översikt över egna ärenden med tio statusar och en synlig tidslinje.'),
    'B.1.35': (UPPFYLLD, 'Löpande dialog i ärendet. Interna anteckningar syns aldrig för hyresgästen. Notis vid nytt meddelande.'),
    'B.1.36': (UPPFYLLD, 'Bokning av tvättstuga och andra resurser. Dubbelbokning hindras av databasen, inte av gränssnittet.'),
    'B.1.37': (UPPFYLLD, 'Resurser knyts till område, fastighet eller byggnad.'),
    'B.1.38': (UPPFYLLD, 'Resurser kan även knytas till trapphus och enskilt objekt.'),
    'B.1.39': (UPPFYLLD, 'Schema med lediga och upptagna tider, mot resursens öppettider.'),

    # ----------------------------------------------------------- C.1 ---
    'C.1.1': (RUTIN, 'Årscykel med kvartalsgenomgång, behörighetsgenomgång, rutingenomgång och övning. Se docs/rutiner/sakerhetsarbete.md.'),
    'C.1.2': (RUTIN, 'Klassning i fyra nivåer med åtgärdstider från 24 timmar till nästa release. Se docs/rutiner/sakerhetsarbete.md.'),
    'C.1.3': (RUTIN, 'Beroenden gås igenom varje månad och uppgraderas löpande. npm audit rapporterar i dag noll sårbarheter.'),
    'C.1.4': (RUTIN, 'OWASP ASVS nivå 2 som måttstock och Top 10 som checklista. Dokumentet visar var i koden varje risk hanteras.'),
    'C.1.5': (RUTIN, 'Automatiska tester och beroendegranskning vid varje bygge, egen ASVS-genomgång varje halvår, penetrationstest av extern part före driftsättning och därefter årligen. Penetrationstestet är inte genomfört.'),
    'C.1.6': (RUTIN, 'Personlig och tidsbegränsad åtkomst med multifaktor. Support arbetar i tjänstens egna gränssnitt, så att åtkomsten hamnar i säkerhetsloggen.'),
    'C.1.7': (RUTIN, 'Filers verkliga format kontrolleras, PDF med aktivt innehåll avvisas, och en konfigurerad skanner som inte svarar sätter filen i karantän. Extern skanningstjänst är inte upphandlad.'),
    'C.1.8': (RUTIN, 'Konfiguration i versionshanterad kod och miljövariabler. Hemligheter ligger aldrig i databasen, bara en referens som slås upp i driftmiljön.'),
    'C.1.9': (RUTIN, 'Se docs/rutiner/saker-utveckling.md, avsnitt C.6.5.'),
    'C.1.10': (RUTIN, 'Ingen ändring når produktion utan att hela testsviten och bygget gått igenom. Större förändringar granskas dessutom i testmiljön.'),
    'C.1.11': (UPPFYLLD, 'docs/arkitektur.md beskriver komponenter, datamodell, driftmodell och vad tjänsten vilar på.'),
    'C.1.12': (UPPFYLLD, 'Logisk separering i databasen med radnivåsäkerhet på 69 av 71 tabeller. Applikationens roll saknar SUPERUSER och BYPASSRLS, och servern vägrar starta om det inte stämmer. Fjorton tester prövar det.'),
    'C.1.13': (LEVERANS, 'Testmiljö med samma uppsättning som produktion, egen databas och egna hemligheter, och demodata i stället för kopierade personuppgifter. Sätts upp vid införandet.'),

    # ----------------------------------------------------------- C.2 ---
    'C.2.1': (AVTAL, 'BankID-klient över ömsesidig TLS med animerad QR-kod enligt specifikationen. Kräver avtal med BankID-leverantör och RP-certifikat. Simulatorn kan inte slås på i produktion och redovisas som testmiljö.'),
    'C.2.2': (UPPFYLLD, 'Personnumret matchas mot en pepprad hash på kundposten. Det lagras aldrig i klartext och skrivs aldrig i säkerhetsloggen.'),
    'C.2.3': (UPPFYLLD, 'Behörigheten prövas i backend vid varje läsning, ändring och filhämtning. Att filtrera i gränssnittet räcker inte, och görs inte.'),
    'C.2.4': (KONFIGURATION, 'OpenID Connect med authorization code och PKCE. Flödet är prövat mot en riktig leverantör i test. Kräver appregistrering i beställarens katalog.'),
    'C.2.5': (KONFIGURATION, 'OpenID Connect enligt standarden, med discovery och verifiering mot utfärdarens publika nycklar. Kräver uppgifter enligt C.2.4.'),
    'C.2.6': (KONFIGURATION, 'Multifaktor sköts av katalogen vid federerad inloggning. Utan federation gäller tjänstens egen engångskod, som är obligatorisk för alla personalroller.'),
    'C.2.7': (RUTIN, 'Leverantörens administrativa konton och supportkonton skyddas med multifaktor. Se docs/rutiner/sakerhetsarbete.md.'),
    'C.2.8': (UPPFYLLD, 'Elva roller med en rättighetsmatris, och avgränsning till område eller fastighet per användare.'),
    'C.2.9': (UPPFYLLD, 'Inloggningar och administrativa åtgärder hamnar i säkerhetsloggen med användare, roll, utfall, IP-adress och spårnings-id.'),
    'C.2.10': (UPPFYLLD, 'Sessioner avslutas vid inaktivitet, med kortare gräns för personal än för hyresgäster. Gränsen kontrolleras vid varje anrop.'),
    'C.2.11': (UPPFYLLD, 'Engångskod krävs för samtliga personalroller och kan inte stängas av för dem.'),
    'C.2.12': (UPPFYLLD, 'Integrationer loggar in som klient med scope-begränsade konton. Kontot är av typen service och kan inte logga in som en människa. Hemligheten kan bytas och kontot stängas av, vilket ogiltigförklarar utfärdade token direkt.'),
    'C.2.13': (KONFIGURATION, 'Åtkomsten följer hyresförhållandet: när avtalet avslutas i fastighetssystemet avslutas åtkomsten vid nästa synkronisering. Kräver anslutning enligt A.1.8.'),

    # ----------------------------------------------------------- C.3 ---
    'C.3.1': (LEVERANS, 'All kommunikation sker över TLS. Versionskrav och certifikat sätts i driftmiljön, som upphandlas inför driftsättning. HSTS är påslaget i produktionsläge.'),
    'C.3.2': (UPPFYLLD, 'API:er och integrationer kräver autentisering. Hemligheter lagras hashade eller som referens till driftmiljön, och loggramverket tar bort kända känsliga fält innan raden skrivs.'),
    'C.3.3': (UPPFYLLD, 'Varje integrationskonto får bara de scope det behöver, och ett scope som inte tilldelats ger fel i stället för tyst nedgradering.'),
    'C.3.4': (UPPFYLLD, 'Integrationsanrop registreras i integration_events med riktning, utfall, svarstid och felmeddelande.'),
    'C.3.5': (UPPFYLLD, 'Fel ger växande fördröjning som planar ut. Utgående ändringar ligger kvar i kö tills källsystemet kvitterat. Tio tester prövar beteendet mot ett källsystem som svarar fel.'),
    'C.3.6': (UPPFYLLD, 'Behörigheten prövas på objektnivå. Fjorton tester begär det andra bolagets uppgifter med giltig session och rätt id, och får noll rader.'),
    'C.3.7': (UPPFYLLD, 'Varje överföring bär referens till användare, funktion och händelse, och kopplas till källsystemets egen nyckel.'),
    'C.3.8': (UPPFYLLD, 'Indata valideras mot scheman innan något skrivs. En post som saknar ett fält skrivs inte alls.'),
    'C.3.9': (UPPFYLLD, 'Förändringar som skickas eller tas emot registreras med tidpunkt och utfall.'),
    'C.3.10': (UPPFYLLD, 'Schemalagd synkronisering per datamängd, med färskhetsstämpel och tydlig markering när uppgifterna är gamla.'),
    'C.3.11': (UPPFYLLD, 'Vid störning behålls senast lyckade tidpunkt, markören flyttas inte, och en post som inte gick att tolka skrivs inte in halvfärdig.'),
    'C.3.12': (UPPFYLLD, 'Servicearbetaren cachar bara programfilerna, aldrig svar från API:et. Ingen kunddata lagras på enheten.'),
    'C.3.13': (UPPFYLLD, 'Gränssnittet skriver ut när en datamängd aldrig hämtats eller är för gammal, i stället för att visa uppgifterna som aktuella.'),
    'C.3.14': (UPPFYLLD, 'Behörighet prövas på objekt- och funktionsnivå vid varje anrop, så att en användare inte kan nå annan hyresgäst, annat avtal, annat ärende eller annan bostad.'),

    # ----------------------------------------------------------- C.4 ---
    'C.4.1': (UPPFYLLD, 'Säkerhetsrelaterade händelser, administrativa åtgärder, inloggningar och integrationshändelser loggas. Se docs/rutiner/loggning-och-overvakning.md.'),
    'C.4.2': (UPPFYLLD, 'Applikationens databasroll saknar UPDATE och DELETE på säkerhetsloggen. Rättigheten är återkallad i databasen, inte kontrollerad i koden.'),
    'C.4.3': (RUTIN, 'Beställaren når säkerhetsloggen själv. Övriga loggar lämnas inom en arbetsdag från begäran, i maskinläsbart format.'),
    'C.4.4': (RUTIN, 'Tröskelvärden för avvikande beteende är fastställda och underlaget finns i login_attempts och audit_log. Övervakningsverktyget är inte upphandlat.'),

    # ----------------------------------------------------------- C.5 ---
    'C.5.1': (RUTIN, 'Webbklienten följer motsvarande krav. OWASP MASVS blir tillämpligt för de nativa apparna och ingår i deras utveckling.'),
    'C.5.2': (UPPFYLLD, 'Ingen skyddsvärd information lagras okrypterat på enheten. Servicearbetaren cachar aldrig svar från API:et.'),
    'C.5.3': (UPPFYLLD, 'Pushnotisen säger att något hänt, inte vad. Detaljerna läses i appen efter inloggning.'),
    'C.5.4': (UPPFYLLD, 'All kommunikation mellan app och backend sker över TLS, med HSTS i produktionsläge.'),
    'C.5.5': (UPPFYLLD, 'Webbläsarens certifikatkontroll gäller, och kan inte stängas av i klienten. BankID-anropen kontrollerar certifikat mot BankID:s CA. Certifikatnålning tillkommer i de nativa apparna.'),
    'C.5.6': (UPPFYLLD, 'Filtyper och storlek begränsas per fastighetsbolag. Innehållet kontrolleras mot sitt verkliga format, PDF med aktivt innehåll avvisas, och metadata rensas ur bilder. Filer nås bara av behöriga, genom en kontroll i backend.'),

    # ----------------------------------------------------------- C.6 ---
    'C.6.1': (RUTIN, 'Personliga konton med multifaktor till kod, byggkedja och hemligheter. Utvecklare har inte åtkomst till produktion.'),
    'C.6.2': (UPPFYLLD, 'All kod och konfiguration i Git, med granskad sammanslagning. Databasens struktur ändras bara genom numrerade migreringar.'),
    'C.6.3': (RUTIN, 'Utveckling, test och produktion delar varken databas, lagring eller hemligheter. Personuppgifter kopieras aldrig från produktion.'),
    'C.6.5': (RUTIN, 'Föregående version kan sättas i drift på minuter. Migreringar som rör befintlig data delas i tre steg, så att det går att gå tillbaka utan dataförlust.'),
    'C.6.6': (RUTIN, 'Förändring som rör autentisering, behörighet, kundseparering, filhantering, loggning eller externt gränssnitt får egen säkerhetsgenomgång och utökade tester.'),
    'C.6.7': (RUTIN, 'Gäller egen kod, tredjepartskomponenter och driftmiljö, med samma klassning och tider som C.1.2. Ett bygge med känd kritisk sårbarhet i drift går inte vidare.'),

    # ----------------------------------------------------------- C.7 ---
    'C.7.1': (RUTIN, 'Sju steg från upptäckt till uppföljning, med klassning i tre nivåer. Se docs/rutiner/incidenthantering.md.'),
    'C.7.2': (RUTIN, 'Första besked inom 4 timmar vid allvarlig incident, även när bilden är ofullständig. Underlaget är anpassat för beställarens frist på 72 timmar.'),
    'C.7.3': (RUTIN, 'Kontaktvägar för normal ärendegång, incident under och utanför kontorstid, samt eskalering, med angivna svarstider.'),
    'C.7.4': (RUTIN, 'Namngivna roller med ersättare, beredskap utanför kontorstid, och årlig övning. Sessioner och integrationskonton kan stängas av direkt i tjänstens gränssnitt.'),
    'C.7.5': (RUTIN, 'Varje incident dokumenteras med förlopp, berörd information, åtgärder och beslutade förbättringar.'),

    # ----------------------------------------------------------- C.8 ---
    'C.8.1': (RUTIN, 'Daglig fullständig kopia och kontinuerlig arkivering av transaktionsloggen, med mål för återställningstid och dataförlust.'),
    'C.8.2': (RUTIN, 'Backuper krypteras i vila, ligger skilt från databasen, och nås bara av driftansvarig med multifaktor.'),
    'C.8.3': (RUTIN, 'Automatisk provläsning varje vecka och fullständig återställningsövning varje år, med uppmätt tid mot målet.'),
    'C.8.4': (RUTIN, 'Tröskelvärden för svarstid, felandel, anslutningar, diskutrymme och köer är fastställda. Tjänsten har beredskapskontroller för ändamålet.'),
    'C.8.5': (RUTIN, 'Flera instanser, beredskapskopia av databasen, och köer med omförsök så att en störning fördröjer men inte tappar uppgifter.'),

    # ----------------------------------------------------------- C.9 ---
    'C.9.1': (RUTIN, 'Underlag lämnas inom tio arbetsdagar. Vad som finns att visa framgår av docs/rutiner/uppfoljning.md.'),
    'C.9.2': (RUTIN, 'Årlig säkerhetsredogörelse med genomförda åtgärder, incidenter, testresultat och planerat arbete.'),
    'C.9.3': (RUTIN, 'Uppföljningen bygger på dokumentation, självdeklaration och testrapporter. Certifiering enligt ISO 27001 finns inte och skulle behöva avtalas särskilt.'),
    'C.9.4': (RUTIN, 'Fördjupad uppföljning vid större förändring, allvarlig incident eller ny väsentlig underleverantör.'),

    # ---------------------------------------------------------- C.10 ---
    'C.10.1': (UPPFYLLD, 'Ingen språkmodell finns i produkten. Prioritering, jourinformation och styrning av ärenden avgörs av regler som går att läsa och testa. Villkor för framtida införande i docs/rutiner/ai-styrning.md.'),
    'C.10.2': (RUTIN, 'Beställarens information används inte för att träna eller utveckla AI-modeller. Villkoret gäller även framtida modelleverantörer och kräver skriftligt godkännande.'),
}
