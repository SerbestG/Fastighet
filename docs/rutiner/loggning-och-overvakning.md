# Loggning, spårbarhet och övervakning

Besvarar krav C.4.1–C.4.4, och krav A.1.13 om loggning av API-anrop.

## C.4.1 Vad som loggas

Tjänsten har tre loggar med olika syfte.

### Säkerhetsloggen (`audit_log`)

Bär det som behöver gå att följa upp i efterhand.

| Vad | Exempel på åtgärd |
| --- | --- |
| Inloggningar och sessioner | `auth.login`, `auth.login.sso`, `auth.login.bankid`, `auth.logout` |
| Administrativa åtgärder | `user.created`, `user.role_changed`, `integration.updated` |
| Ärendehantering | `case.created`, `case.updated`, `case.commented` |
| Utskick | `notice.published`, `message.sent` |
| Filer | `file.uploaded`, `file.downloaded` |
| Integrationskonton | `oauth.client.created`, `oauth.client.rotated`, `oauth.client.disabled` |
| Tillträde | `access.granted`, `access.revoked` |

Varje rad bär tidpunkt, vem som gjorde det, vilken roll, vilket objekt, utfall,
IP-adress, webbläsarsträng och spårnings-id.

### Integrationsloggen (`integration_events`)

Anrop till och från anslutna system, med riktning, utfall, svarstid och
felmeddelande. Innehållet i anropet loggas inte, bara att det skedde och hur det
gick.

### Driftloggen

Applikationens egen logg. Varje rad bär samma spårnings-id som svaret till
klienten, så att ett fel en användare rapporterar går att hitta.

### Vad som aldrig loggas

Lösenord, fullständiga token, API-nycklar, personnummer och innehållet i
uppladdade filer. Två skydd finns:

- Loggramverket tar bort kända känsliga fält innan raden skrivs
  (`packages/api/src/app.ts`).
- Säkerhetsloggens detaljfält rensas på kända känsliga nycklar innan det sparas,
  även om en anropare skulle skicka med dem (`packages/api/src/core/audit.ts`).

## C.4.2 Skydd mot obehörig åtkomst och manipulation

**Manipulation.** Applikationens databasroll saknar `UPDATE` och `DELETE` på
`audit_log` och `integration_events`. Rättigheten är återkallad i databasen, inte
kontrollerad i koden — även den som kommer åt applikationens konto kan alltså
inte skriva om historien.

Det går att kontrollera:

```
$ psql -U hemvist_app -c "update audit_log set action = 'x'"
FEL: behörighet nekad för tabell audit_log
```

**Läsning.** Säkerhetsloggen kräver behörigheten `audit:read`, som bara
administratörsrollen har. Loggen är dessutom kundseparerad som all annan data:
en administratör hos ett fastighetsbolag ser aldrig ett annat bolags rader.

**Export.** Loggar som lämnar tjänsten för långtidsförvaring skickas krypterat
och lagras med samma skydd som backuper.

## C.4.3 Bistånd med loggar vid incident eller felsökning

Beställaren når säkerhetsloggen själv i förvaltningsgränssnittet, med sökning på
åtgärd och användare. Det räcker för de flesta frågor.

Vid incident eller felsökning som kräver mer lämnar leverantören driftloggar och
integrationsloggar för angiven tidsperiod, inom en arbetsdag från begäran, i ett
format som går att läsa maskinellt. Underlaget begränsas till det som frågan
gäller.

Spårnings-id är den gemensamma nyckeln: användaren ser det vid ett fel,
det står i svaret från API:et, i driftloggen och i säkerhetsloggen.

## C.4.4 Övervakning och upptäckt av avvikande beteende

Utöver kapacitetslarmen i [backup-och-kontinuitet.md](backup-och-kontinuitet.md):

| Signal | Larmar vid | Varför |
| --- | --- | --- |
| Misslyckade inloggningar mot samma konto | 10 på 5 minuter | Lösenordsgissning |
| Misslyckade inloggningar från samma adress | 50 på 5 minuter | Bredare försök |
| Nekade behörighetskontroller (403) för samma konto | 20 på 5 minuter | Konto som prövar sig fram |
| Filhämtningar från samma konto | 100 på en timme | Massuttag av uppgifter |
| Nya integrationskonton | Vid varje | Ska alltid vara ett känt beslut |
| Byte av klienthemlighet | Vid varje | Detsamma |
| Utfärdade token från ny IP-adress för ett integrationskonto | Vid varje | Konto som används från oväntad plats |

Tjänsten har underlaget för detta: `login_attempts` registrerar varje försök,
och `audit_log` bär utfallet på varje åtgärd inklusive nekade.

Larmen kräver ett övervakningsverktyg i driftmiljön. Det **är inte upphandlat**,
och tröskelvärdena ovan är de som ska ställas in när det är på plats.

## A.1.13 Loggning av API-anrop

Varje anrop loggas med tidsstämpel, IP-adress, sökväg, svarskod och svarstid.
Anrop från en inloggad användare eller ett integrationskonto bär dessutom
användar- respektive klientidentitet. Authorization-huvudet tas bort innan raden
skrivs.
