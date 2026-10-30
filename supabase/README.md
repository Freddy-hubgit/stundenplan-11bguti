# Support-Tickets aktivieren

Die Webseite liegt in `stundenplan-11bguti`. Die Desktop-/Android-App bleibt unverändert.

Einmalig `migrations/202610210001_support_tickets.sql` im SQL-Editor des zugehörigen
Supabase-Projekts als Datenbankadministrator ausführen (oder mit dem bestehenden
Supabase-Migrationsablauf einspielen). Die Migration ist transaktional und setzt
die vorhandene Tabelle `public.profiles` mit `id`, `full_name` und `role` voraus.
Nicht mehrfach manuell ausführen. Es werden keine vorhandenen Profilrichtlinien verändert.

Danach die Webseite bauen und wie gewohnt veröffentlichen. Es sind keine zusätzlichen
Frontend-Schlüssel nötig. Administrator-Zugangsdaten gehören niemals in die Webseite.
Die Migration wurde lokal in PostgreSQL/PGlite geprüft, aber nicht im Live-Projekt ausgeführt.

## Verhalten und Rechte

- Alle angemeldeten Nutzer sehen Namen und Rollen des Support-/Admin-Teams, keine E-Mail-Liste.
- Normale Nutzer erstellen Tickets und sehen ausschließlich ihre eigenen Gespräche.
- Support und Admins sehen alle Tickets, antworten, schließen und öffnen Tickets wieder.
- Geschlossene Tickets bleiben lesbar; neue Nachrichten sind bis zur Wiederöffnung gesperrt.
- Chats aktualisieren sich alle fünf Sekunden. Keine Realtime-Publication erforderlich.
- Neue Tickets und erste Nachricht werden zusammen gespeichert. Nachrichten sind unveränderlich.
- Datenbankfunktionen prüfen die Identität und Rollen serverseitig; direkte Tabellenzugriffe
  sind für `anon` und `authenticated` gesperrt. Absender und Rollen kommen nicht vom Client.
- Wie die bestehende Kontenverwaltung setzt auch diese Funktion voraus, dass normale Nutzer
  ihre Rolle in `profiles` nicht selbst erhöhen können. Bestehende Profilrichtlinien und
  Account-Funktionen müssen diese Voraussetzung erfüllen.

## Lokale Prüfungen

Produktionsbuild ohne Änderung der versionierten Versionsdatei:

```sh
NG_CLI_ANALYTICS=false NG_BUILD_MAX_WORKERS=4 ./node_modules/.bin/ng build --configuration production
```

Datenbank-Regressionsprüfung mit einem separaten Testwerkzeug (keine Änderung der App-Abhängigkeiten):

```sh
npm install --prefix /tmp/support-db-tests --no-audit --no-fund @electric-sql/pglite@0.5.10
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/support-database.mjs
```

Browserprüfung: Entwicklungsserver auf Port 4200 starten und mit vorhandenem Python Playwright
und Chromium `/usr/bin/chromium` `python tests/support-browser.py` ausführen. Diese Prüfung
simuliert die Supabase-API und prüft Benutzeroberfläche, Rollenansichten, Nachrichten,
Aktualisierung, Statuswechsel und Fehlerfälle. Sie ersetzt keinen Live-Test nach der Migration.

## Vertretungsplan aktivieren

Zusätzlich `migrations/202610210002_substitution_plan.sql` einmalig im SQL-Editor
als Datenbankadministrator ausführen. Diese Migration ist unabhängig von der Ticketmigration,
setzt aber ebenfalls die bestehende `profiles`-Tabelle und geschützte Rollen voraus.

Alle angemeldeten Nutzer sehen den Vertretungsplan. Nur Support und Admins können
fehlende Lehrkräfte für ein Datum und einen Zeitraum eintragen, ändern und löschen.
Es werden Ersatzlehrkraft, optional Ersatzraum und Hinweis gespeichert. Alternativ
kann Unterricht als ausgefallen markiert werden. Einträge derselben Lehrkraft dürfen
sich am selben Tag nicht überschneiden; konkurrierende Schreibvorgänge werden serialisiert.

Der Stundenplan ordnet Einträge anhand von Datum, Lehrkraft (ohne Beachtung der
Groß-/Kleinschreibung und äußerer Leerzeichen) und Zeitüberschneidung zu. Die Schreibweise
muss zum Stundenplan passen; die Eingabe schlägt die vorhandenen Lehrkraftbezeichnungen vor.
Bei zusammengesetzten Lehrkraftbezeichnungen gilt der Eintrag für diese gesamte Bezeichnung.
Teilvertretungen teilen eine Stunde in reguläre und geänderte Zeitabschnitte. Reguläre
Stunden bleiben unverändert gespeichert; Vertretungen und Ausfälle gelten nur am eingetragenen
Datum und werden auch bei der aktuellen/nächsten Stunde berücksichtigt. Beide Ansichten
aktualisieren die gemeinsamen Daten alle 15 Sekunden. Kalender-/JSON-Exporte bleiben Exporte
des regulären Wochenstundenplans, ohne die tagesbezogenen Vertretungen.

Tests (mit den oben beschriebenen Werkzeugen):

```sh
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/substitution-database.mjs
python tests/substitution-browser.py
```

Die Browserprüfung nutzt eine simulierte Supabase-API, die Datenbankprüfung eine lokale
PostgreSQL-Instanz in PGlite. Die Live-Migration und das Live-Verhalten müssen nach der
Einrichtung im tatsächlichen Supabase-Projekt überprüft werden.

### Abwesenheiten über mehrere Tage

Für Datumsbereiche zusätzlich `migrations/202610210003_substitution_date_range.sql`
einmalig im Supabase-SQL-Editor ausführen. Die Migration setzt die Vertretungsplan-Migration
`202610210002` voraus. Anfangs- und Enddatum sind eingeschlossen (maximal 366 Tage).
Die gleichen Uhrzeiten und Vertretungsinformationen gelten an jedem Tag. Alle Tages-Einträge
werden atomar gespeichert; bei einem Konflikt wird nichts aus diesem Vorgang gespeichert.
Bestehende Einträge bleiben unverändert. Anschließend können die Tage einzeln bearbeitet
oder gelöscht werden. In der Wochenübersicht erscheinen nur Tage mit Einträgen; eine leere
Woche zeigt stattdessen eine gemeinsame Meldung.

## Kalender und Jitsi-Videokonferenzen

Einmalig `migrations/202610240004_calendar_and_meetings.sql` im Supabase-SQL-Editor
als Datenbankadministrator ausführen. Die Migration setzt nur die bestehende `profiles`-Tabelle
mit geschützten Rollen voraus. Sie benötigt die Ticket-/Vertretungsplan-Migrationen nicht.
Die Migration wurde lokal getestet und nicht im Live-Projekt ausgeführt.

- Alle angemeldeten Nutzer sehen den gemeinsamen Kalender und die Besprechungen.
- Support und Admins erstellen, bearbeiten und löschen Termine und Videokonferenzen.
- Der Kalender zeigt eine Monatsansicht mit Tagesagenda; auch mehrtägige Termine erscheinen
  an jedem betroffenen Tag. Zeiten werden in der lokalen Browser-Zeitzone eingegeben/angezeigt
  und als UTC-Zeitpunkte gespeichert. `.ics`-Downloads ermöglichen den Import in andere Kalender.
- Videokonferenzen erzeugen einen zufälligen, dauerhaft gespeicherten Raumlink auf `meet.jit.si`.
  Bearbeiten ändert diesen Link nicht. Die Besprechungen erscheinen zusätzlich im Kalender;
  vergangene Besprechungen sind in der Videoansicht über einen Filter erreichbar.
- „Teilnehmen“ öffnet den externen Jitsi-Dienst in einem neuen Tab. Jitsi kann eine Anmeldung
  zum Starten eines Raums verlangen. Raumzugang, Moderation, Kamera und Mikrofon werden von
  Jitsi verwaltet; die Portal-Anmeldung ersetzt keine Jitsi-Anmeldung und schützt keinen bereits
  geteilten Raumlink. Ein Löschen des Portal-Termins löscht keinen Raum beim externen Anbieter.
- Es sind keine zusätzlichen API-Schlüssel oder Supabase-Realtime-Einstellungen notwendig.
  Die Ansichten laden alle 30 Sekunden neu. Direkte Tabellenzugriffe sind gesperrt; RPCs prüfen
  die Identität und Schreibrolle serverseitig. Meetinglinks müssen HTTPS verwenden.
- Browserprüfungen simulieren die Supabase-API und prüfen unter anderem Raumlink, Kalender,
  Export, Rollenansichten und Fehlerfälle. Ein tatsächlicher Jitsi-Videoanruf ist nicht Bestandteil
  der lokalen Prüfung. Nach der Live-Migration einen Termin speichern und einen Jitsi-Raum
  mit zwei Browsern/Geräten testen.

```sh
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/portal-events-database.mjs
python tests/portal-events-browser.py
```

## Rolle „Lehrer“ und Kalender-/Ticketrechte

1. `migrations/202610240005_teacher_permissions.sql` einmalig im Supabase-SQL-Editor
   ausführen. Voraussetzung sind die Ticket- und Kalender-Migrationen (`202610210001`
   und `202610240004`). Die Migration erweitert die übliche `profiles_role_check`-
   Textrollen-Constraint, ohne Profilrichtlinien oder bestehende Konten zu ersetzen.
   Abweichende Rollentypen/zusätzliche Constraints müssen im tatsächlichen Schema geprüft
   werden; Fehler rollen die Migration zurück.
2. Die neue Edge Function aus `functions/create-teacher/index.ts` als `create-teacher`
   bereitstellen, z.B. über Supabase → Edge Functions oder mit angemeldeter Supabase CLI:

   ```sh
   supabase functions deploy create-teacher --project-ref amwowtaxrgfcojlsxhzk
   ```

   `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase im Edge-Runtime bereit.
   Diese Schlüssel niemals in die Webseite kopieren. Die Funktion prüft das Benutzer-Token
   mit Supabase Auth und anschließend die aktuelle Profilrolle. Nur Support/Admin dürfen
   Lehrer anlegen. Eingesendete Rollen werden ignoriert; die Rolle ist serverseitig immer
   `teacher`. Schlägt die Profilanlage fehl, wird das neu angelegte Auth-Konto zurückgenommen;
   ein ebenfalls fehlgeschlagenes Aufräumen wird ausdrücklich als Fehler gemeldet.
   Bestehende Funktionen `quick-responder` und `manage-user` werden nicht ersetzt.

| Rolle | Kalender | Videokonferenz | Support-Tickets | Kontenverwaltung |
| --- | --- | --- | --- | --- |
| Nutzer (`user`) | Kein Zugriff | Lesen/teilnehmen | Eigene Tickets | Nein |
| Lehrer (`teacher`) | Lesen | Lesen/teilnehmen | Kein Zugriff | Nein |
| Support / Admin | Verwalten | Verwalten/teilnehmen | Alle Tickets | Ja |

Normale Nutzer erhalten aus `portal_events_list` nur Besprechungen, keine normalen Termine.
Lehrer können auch frühere eigene Tickets nach einem Rollenwechsel nicht mehr lesen oder
beantworten. Frontend-Kacheln und Routenschutz spiegeln diese serverseitigen Rechte wider.
Lehrerkonten können nach SQL-Migration und Function-Deployment in der Verwaltung über die
neue Rollenoption „Lehrer“ angelegt werden. Die bestehenden Profil-RLS-Regeln müssen weiterhin
verhindern, dass normale Nutzer ihre eigene Rolle verändern.

```sh
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/teacher-permissions-database.mjs
node tests/create-teacher-function.cjs
python tests/teacher-permissions-browser.py
```

Datenbank und Function-Handler sind lokal geprüft; die Handler-Prüfung simuliert das Supabase-SDK.
Die Live-Migration und die neue Edge Function wurden von der Entwicklungsumgebung nicht deployed.

### Rollen bestehender Konten bearbeiten

Zusätzlich `migrations/202610240006_edit_profile_role.sql` einmalig im SQL-Editor
anwenden (nach der Lehrer-Migration `202610240005`). Es ist kein neues Edge-Function-
Deployment nötig. Nach Migration `202610240007` können Support und Admins unter Verwaltung → Bearbeiten die Rolle auswählen und
mit „Rolle speichern“ unabhängig von Name/E-Mail/Passwort ändern. Nutzer und Lehrer haben keinen
Zugriff auf die Kontenverwaltung.

Die Datenbankfunktion prüft den aktuellen Support-/Adminstatus serverseitig und serialisiert
Rollenänderungen. Sie verhindert, dass durch diese Funktion der letzte Admin seine Rolle
verliert. Dieser Schutz gilt für Rollenänderungen, nicht für separat bestehende Konto-
Löschfunktionen. Eine eigene Herabstufung ist möglich, wenn mindestens ein weiterer Admin
existiert; beim Wechsel zu Nutzer/Lehrer verlässt die Oberfläche anschließend die Verwaltung.
Maßgeblich bleibt die aktuelle Rolle in `profiles`, nicht ein möglicherweise älteres
Rollenfeld im Auth-Token.

```sh
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/teacher-permissions-database.mjs
python tests/edit-role-browser.py
```

### Rollenänderungen durch Support

`migrations/202610240007_support_edit_roles.sql` einmalig im SQL-Editor ausführen.
Die Funktion erlaubt Support dieselben vier Zielrollen wie Admins, einschließlich der
Vergabe von Support- und Adminrechten. Nutzer und Lehrer bleiben ausgeschlossen.
Der Schutz des letzten Admins und die sofortige Rechteprüfung bei eigenen Rollenänderungen
bleiben erhalten. Keine Edge Function muss dafür erneut deployed werden.

### Zugriff auf Vertretungsplan und Stundenplanansichten

Die separate Seite `/vertretungsplan` samt Hauptmenü-Kachel ist nur für Support/Admin
zugänglich; direkte Seitenaufrufe anderer Rollen führen ins Hauptmenü. Alle Rollen können im Stundenplan zwischen Tages- und Wochenansicht wechseln.
Die Auswahl wird lokal gespeichert; ohne gespeicherte Auswahl startet die mobile Ansicht
mit einem Tag und der Desktop mit einer Woche. Auf Mobilgeräten lässt sich die Wochenansicht
horizontal scrollen. Bearbeiten, Löschen und Importieren sind für Lehrer, Support und Admin freigegeben; normale Nutzer dürfen nur die Unterrichtsfarben anpassen.
Vertretungen, Ersatzlehrkräfte, Räume und Unterrichtsausfälle bleiben im Stundenplan sichtbar.
Die bisherige Leseschnittstelle `substitution_list` wird weiterhin für diese Darstellung benötigt;
die Rollenbeschränkung betrifft die separate Verwaltungs-/Übersichtsseite, nicht diese Datenquelle.
Es ist keine zusätzliche SQL-Migration erforderlich.

```sh
python tests/timetable-view-permissions-browser.py
```

## Private Direktnachrichten

`migrations/202610270008_direct_messages.sql` einmalig im Supabase-SQL-Editor ausführen.
Die Migration benötigt die vorhandene `profiles`-Tabelle mit UUID-Primärschlüssel, `full_name`
und `role`. Keine zusätzliche Edge Function, kein API-Schlüssel und keine Realtime-Publication
werden benötigt.

Alle angemeldeten Personen (`user`, `teacher`, `support`, `admin`) erhalten eine Kachel
„Nachrichten“. Die Personensuche zeigt Anzeigenamen und Rollen, keine E-Mail-Adressen.
Pro Personenpaar gibt es genau einen privaten Chat, auch wenn beide ihn nacheinander
öffnen. Nachrichten werden serverseitig dem angemeldeten Absender zugeordnet; Lesen und
Schreiben sind ausschließlich den beiden Beteiligten gestattet. Support/Admin haben
in diesen RPCs keinen Sonderzugriff auf fremde Chats. Dies ist Zugriffsschutz, keine
Ende-zu-Ende-Verschlüsselung gegenüber den Datenbankbetreibern.

Die Oberfläche aktualisiert alle vier Sekunden und behält nicht gesendete Entwürfe beim
Wechsel zwischen Chats oder bei fehlgeschlagenen Sendeversuchen. Nachrichten dürfen
höchstens 5000 Zeichen lang sein. Chatverläufe bleiben nach einem Rollenwechsel erhalten;
beim Löschen eines beteiligten Profilkontos werden dessen Chats samt Verlauf gelöscht.
Die Datenbanktabellen sind durch RLS und entzogene Direktzugriffsrechte geschützt;
alle Zugriffe laufen über die geprüften `dm_*`-Funktionen.

### Keine lokalen Unterrichtsausfälle

Die beiden lokalen Ausfall-Checkboxen wurden entfernt. Normale Nutzer können Unterricht
nicht mehr über den Stundeneditor bearbeiten, löschen oder per JSON-Import ersetzen.
Fachwahl, Farben und Darstellung bleiben verfügbar. Lehrer/Support/Admin können den lokalen
Stundenplan weiterhin bearbeiten; Ausfälle werden ausschließlich über den zentralen
Vertretungsplan angezeigt. Auch alte oder importierte `cancelled`-Flags werden ignoriert.
Die Sperre betrifft die unterstützten Bedienwege; der zentrale Ausfall-Datensatz bleibt
serverseitig nur für Support/Admin schreibbar.

```sh
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/direct-messages-database.mjs
python tests/direct-messages-browser.py
python tests/timetable-cancellation-browser.py
```

Die Prüfungen verwenden eine lokale PostgreSQL-Instanz beziehungsweise eine simulierte
Supabase-API. Die Live-Migration wurde nicht von dieser Entwicklungsumgebung ausgeführt.

### Stundenplanrechte

Normale Nutzer können Unterricht nicht hinzufügen, bearbeiten, löschen, umbenennen oder
per JSON ersetzen. Fachfarben sind weiterhin anpassbar; Fachwahl und reine Ansichtsoptionen
bleiben verfügbar. Lehrer, Support und Admin dürfen den lokalen Stundenplan bearbeiten.
Dies gibt Lehrern keinen Zugang zum zentralen Vertretungsplan: Zentrale Ausfälle werden
weiterhin nur durch Support/Admin verwaltet. Keine neue Datenbankmigration nötig.

## Eigenes Hintergrundbild (lokal)

Unter Einstellungen → Darstellung kann jede angemeldete Person ein JPG-, PNG- oder
WebP-Bild auswählen (max. 10 MB, max. 40 Megapixel). Die Verarbeitung erfolgt ausschließlich
im Browser: Das Bild wird auf höchstens 1920 Pixel an der längsten Seite verkleinert und
als komprimiertes Bild in IndexedDB gespeichert. Keine Supabase-Storage-Buckets,
SQL-Migrationen oder zusätzlichen Schlüssel werden benötigt.

Das Bild ist auf allen angemeldeten Seiten sichtbar und wird durch eine zum Theme passende
Überlagerung abgedunkelt/aufgehellt. Panels behalten ihre lesbaren Flächen. Die Speicherung
ist an die Auth-Benutzer-ID und diesen Browser gebunden; ohne den optionalen Kontoupload gibt es keine Synchronisierung
zwischen Geräten. Abmelden oder Kontowechsel entfernt die Bildreferenz aus der aktuellen
Ansicht, ohne das gespeicherte Bild für die nächste Anmeldung zu löschen.

„Hintergrundbild entfernen“ oder die Wahl eines vorgegebenen Hintergrunds löscht das
persönliche Bild aus dem Browserspeicher. Ungültige Dateien und fehlgeschlagene Speichervorgänge
ersetzen das bisherige Bild nicht. Upload-/Entfernen-Fehler werden in den Einstellungen angezeigt.

```sh
python tests/background-image-browser.py
```

## Optionales Kontobild auf mehreren Geräten

Einmalig `migrations/202610280009_account_backgrounds.sql` im Supabase-SQL-Editor ausführen.
Sie erstellt den privaten Bucket `account-backgrounds` (maximal 3 MB je verarbeitetem Bild,
nur JPEG/PNG/WebP) und Zugriffsregeln für genau `<auth.uid()>/background`.
Eine zusätzliche restriktive Regel verhindert auch bei vorhandenen breiten Storage-Regeln,
dass fremde Konten oder anonyme Aufrufe auf Kontobilder zugreifen. Andere Buckets werden
von dieser Begrenzung nicht verändert. Ein vorhandener gleichnamiger Bucket mit abweichender
Konfiguration führt zu einem Fehler statt zu einer stillen Änderung.

- „Bild auswählen“ verarbeitet und speichert wie bisher nur lokal.
- „Im Konto speichern“ lädt das aktuelle Bild ausdrücklich in den privaten Kontospeicher hoch.
  Es wird nie automatisch ein neu gewähltes lokales Bild hochgeladen.
- Andere Geräte ohne lokale Bildauswahl laden das Kontobild bei der Anmeldung oder beim Neuladen.
  Ein bereits bewusst lokal gewähltes/entferntes Bild hat auf diesem Gerät Vorrang.
  Mit „Kontobild laden“ kann das Kontobild explizit wieder übernommen werden.
- „Hintergrundbild entfernen“ und die Wahl eines Standardhintergrunds wirken nur in diesem
  Browser und löschen kein Kontobild.
- „Kontobild löschen“ löscht die Cloudkopie. Die aktuelle lokale Kopie auf dem löschenden Gerät
  bleibt erhalten; andere Geräte im Kontomodus entfernen ihre Kopie bei der nächsten Anmeldung/
  beim Neuladen, sobald das Fehlen des Kontobilds bestätigt ist.
- Bei fehlgeschlagenen Uploads bleibt das lokale Bild erhalten. Bei Netzwerkproblemen kann
  eine vorhandene lokale Kopie des Kontobilds weiterhin angezeigt werden. Änderungen auf anderen
  Geräten werden nicht live übertragen, sondern beim nächsten Laden erkannt.

Keine neue Edge Function oder zusätzliche API-Schlüssel nötig. Der vorhandene Supabase-Client
verwendet das Benutzer-Token. Bilder sind nicht öffentlich; beim Anzeigen lädt der Client den
privaten Inhalt und verwendet im Browser eine temporäre Blob-URL statt eines öffentlichen Links.
Die Migration und Zugriffsregeln wurden lokal geprüft, die Browserprüfung simuliert die Storage-API.
Die Live-Migration wurde hier nicht ausgeführt.

```sh
PGLITE_MODULE_PATH=/tmp/support-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/account-backgrounds-database.mjs
python tests/account-backgrounds-browser.py
```

## Hausaufgaben und mehrere Rollen (Migrationen 010–012)

Die aktuelle Rollenverwaltung unterstützt mehrere Rollen pro Konto; deren Berechtigungen werden kombiniert. Hausaufgaben bieten persönliche Erledigung, optionale Text-/Link-/Dateiabgaben und Web-Push am Vorabend. Datenbank, Edge Function, Secrets und Cron müssen einmal eingerichtet werden: [vollständige Aktivierungsanleitung](HOMEWORK_SETUP.md).

## Krankmeldungen und Wunschvertretung (Migrationen 013–015)

Lehrkräfte beantragen Entfall oder eine Wunschvertretung; Admins erhalten Meldungen und bestätigen die Entscheidung. Erst danach erscheinen Änderungen im Schüler-Stundenplan und werden Schüler benachrichtigt. Schüler erhalten Unterrichtsänderungen in einer privaten Benachrichtigungsliste, auf Wunsch auch per Web-Push bei geschlossener Webseite. [Einrichtung und Ablauf](ABSENCE_SETUP.md).

## Chat erst beim ersten Senden anlegen (Migration 016)

Nach Migration 008 den gesamten Inhalt von [`migrations/202610300016_lazy_direct_chats.sql`](migrations/202610300016_lazy_direct_chats.sql) im SQL Editor ausführen und die aktualisierte Webseite laden. Die Personenauswahl speichert keinen Chat. Erst `dm_start` erstellt Chat und erste Nachricht atomar; Fehler hinterlassen keinen neuen leeren Chat. Bereits vorhandene leere Chats werden aus der Liste ausgeblendet und bei einer späteren ersten Nachricht wiederverwendet. Nachrichten und bestehende Gespräche bleiben erhalten. Edge Functions und Push-Konfiguration müssen dafür nicht geändert werden.
