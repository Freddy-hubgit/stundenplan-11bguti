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
