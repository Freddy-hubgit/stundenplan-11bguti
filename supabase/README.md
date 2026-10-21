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
