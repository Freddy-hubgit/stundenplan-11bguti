# Hausaufgaben, Mehrfachrollen und Push aktivieren

Die Webseite enthält die Oberfläche. Die folgenden Schritte aktivieren die Datenbank und Erinnerungen im Supabase-Projekt `amwowtaxrgfcojlsxhzk`. Eine echte Push-Zustellung auf einem Endgerät muss anschließend geprüft werden.

## 1. Datenbank aktualisieren

Voraussetzung: Die bisherigen Migrationen 001 bis 009 wurden ausgeführt. Im Supabase SQL Editor jeweils den vollständigen Inhalt dieser Dateien in dieser Reihenfolge ausführen:

1. `migrations/202610280010_multiple_roles.sql`
2. `migrations/202610280011_homework.sql`
3. `migrations/202610280012_homework_push.sql`

Migration 011 erstellt den privaten Storage-Bucket `homework-submissions` samt Zugriffsregeln automatisch. Keine öffentlichen Dateirechte vergeben. Erlaubt sind PDF, PNG, JPEG, WebP, TXT, DOCX, XLSX und ODT bis 10 MB.

In Verwaltung → Bearbeiten können Support und Admin mehrere Rollen auswählen. Die Berechtigungen werden kombiniert; der letzte Admin bleibt geschützt. Neue Konten erhalten zunächst eine Rolle und können danach weitere erhalten.

Jeder kann persönliche Aufgaben erstellen. Mit den Migrationen 017–019 veröffentlichen zugeordnete Lehrkräfte und Admins Aufgaben gezielt für Klassen oder Kurse. Dafür zusätzlich die [Schulportal-Einrichtung](SCHOOL_SETUP.md) durchführen; alte globale Aufgaben bleiben zunächst nur ihren Autoren sichtbar. Der Erledigt-Status gilt pro Person. Mit der Rolle Nutzer kann man Text, einen HTTPS-Link und/oder eine Datei abgeben. Die eigene Abgabe und die Abgaben zur selbst veröffentlichten Aufgabe sind zugänglich; für fremde Abgaben muss der Aufgabenautor weiterhin Lehrer oder Admin sein. Archivieren erhält vorhandene Abgaben.

## 2. Push-Schlüssel erstellen

Einmal lokal im Repository ausführen:

```sh
node scripts/generate-homework-push-keys.mjs
```

Die Ausgabe enthält private Schlüssel. Ausschließlich sicher in Supabase hinterlegen, niemals in Git oder Chat. In Supabase → Edge Functions → Secrets eintragen:

- `VAPID_PUBLIC_KEY`: erzeugter öffentlicher Schlüssel
- `VAPID_PRIVATE_KEY`: erzeugter privater Schlüssel
- `VAPID_SUBJECT`: eigene Kontaktadresse, z. B. `mailto:admin@example.org`
- `HOMEWORK_CRON_SECRET`: erzeugtes zufälliges Geheimnis

Schlüssel dauerhaft aufbewahren. Nach einem Schlüsselwechsel müssen Geräte Push erneut aktivieren. Supabase stellt Projekt-URL und Service-Role-Schlüssel automatisch für die Funktion bereit; diese gehören nicht in den Frontend-Code.

## 3. Edge Function veröffentlichen

Den vollständigen Inhalt von `functions/homework-reminders/index.ts` als Funktion **homework-reminders** bereitstellen. Den Vorlageninhalt von `index.ts` ersetzen.

**Verify JWT with legacy secret: AUS.** Der Code prüft angemeldete Nutzer selbst; der Versand benötigt das separate Cron-Geheimnis. Ein Nutzer-Token allein erlaubt keinen Versand.

Alternativ über eine angemeldete Supabase CLI:

```sh
supabase functions deploy homework-reminders --project-ref amwowtaxrgfcojlsxhzk --no-verify-jwt
```

## 4. Automatischen Zeitplan einrichten

In Supabase Vault ein Secret namens **homework_reminder_secret** anlegen. Sein Wert muss exakt dem Edge-Secret `HOMEWORK_CRON_SECRET` entsprechen. Danach `setup/homework-reminder-cron.sql` im SQL Editor ausführen. Bei einem anderen Projekt vorher dessen URL in dieser Datei einsetzen.

Der Job läuft alle fünf Minuten. Die Funktion verwendet die Zeitzone Europe/Berlin und erinnert am Vorabend an Aufgaben für morgen. Standard ist 19 Uhr; jeder Nutzer kann eine Zeit zwischen 16 und 22 Uhr wählen. Versandversuche erfolgen innerhalb einer Stunde nach der gewählten Zeit, maximal dreimal und einmal erfolgreich pro Person und Tag. Eine verlangte, noch fehlende Abgabe zählt auch bei angehaktem Erledigt-Status als offen. Persönliche Aufgaben bleiben privat; gemeinsame Aufgaben werden für Konten mit Nutzer-Rolle berücksichtigt.

## 5. Auf dem Gerät aktivieren und prüfen

Die aktualisierte Webseite veröffentlichen. In Hausaufgaben die Erinnerungen auf jedem gewünschten Gerät aktivieren und die Browser-Berechtigung erlauben. Es gibt keine automatische Berechtigungsabfrage beim Seitenaufruf. HTTPS und ein Browser mit Web-Push-Unterstützung sind erforderlich. Auf iPhone/iPad die Webseite zum Home-Bildschirm hinzufügen und dort öffnen.

Benachrichtigungen funktionieren auch bei geschlossenem Webseiten-Tab. Betriebssystem und Browser können die Zustellung verzögern oder unterdrücken. Bei mehreren Konten auf einem Browser werden nur Nachrichten für das zuletzt dort aktive Konto angezeigt; nach Abmeldung werden sie unterdrückt.

Für den Praxistest eine offene Aufgabe für morgen anlegen, Erinnerungen aktivieren und die gewählte Zeit abwarten. Edge-Function-Logs sowie `cron.job_run_details` prüfen. Die private Datei eines anderen Nutzers darf nicht über dessen Link abrufbar sein.

## Lokale Prüfung

Produktionsbuild und Browserprüfungen benötigen die normalen Projektabhängigkeiten. Für die isolierten SQL- und Push-Tests zusätzlich:

```sh
npm install --prefix /tmp/homework-tests @electric-sql/pglite@0.5.10 web-push@3.6.7
PGLITE_MODULE_PATH=/tmp/homework-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/homework-database.mjs
WEB_PUSH_MODULE_PATH=/tmp/homework-tests/node_modules/web-push node tests/homework-push-functions.cjs
```

Die lokalen Tests prüfen Berechtigungen, persönliche Erledigung, private Abgaben, Erinnerungszeitfenster, wiederholte Cron-Aufrufe, Push-Verschlüsselung und Kontofilterung. Sie ersetzen keinen Zustellungstest auf einem echten Gerät.
