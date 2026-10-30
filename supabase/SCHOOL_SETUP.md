# Klassen, Startseitenübersicht, Materialien, Prüfungen und Schuljahres-Reset

Die Änderungen sind im Webseiten-Repository enthalten. Die Live-Datenbank und Edge Function werden mit den folgenden Schritten eingerichtet. Ein Reset wird durch diese Einrichtung **nicht** ausgeführt.

## 1. SQL in dieser Reihenfolge ausführen

Voraussetzung: Migrationen 001 bis 016 wurden erfolgreich ausgeführt.

Im [SQL Editor deines Projekts](https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new) jeweils den **vollständigen Dateiinhalt** ausführen und erst bei Erfolg zum nächsten Schritt gehen:

1. [017 – Klassen, Kurse, Zuordnungen und gezielte Hausaufgaben](migrations/202610300017_school_groups.sql)
2. [018 – Materialien, Prüfungen, Jahrgänge und Nachrichtenzähler](migrations/202610300018_materials_exams.sql)
3. [019 – Reset mit Vorschau und geschützter Bereinigung](migrations/202610300019_school_year_reset.sql)

Die Dateien sind Transaktionen. Bei einem Fehler wird der jeweilige Block nicht teilweise übernommen. Bitte keine Tabellen manuell löschen. Migration 019 setzt eine gültige Verbindung von `profiles.id` zu `auth.users.id` mit kaskadierender Löschung voraus und ergänzt sie gegebenenfalls; verwaiste Profile führen zu einem Fehler statt stiller Datenlöschung.

Die Materialablage legt den privaten Bucket **school-materials** mit maximal 10 MB und festgelegten Dateiformaten an. Falls ein gleichnamiger Bucket bereits anders konfiguriert ist, bricht die Migration mit einem Hinweis ab. Er darf nicht öffentlich sein.

## 2. Reset-Funktion bereitstellen

Öffne [Edge Functions](https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/functions), erstelle eine Funktion über den Editor und nenne sie **school-year-reset**.

Ersetze den gesamten Inhalt von `index.ts` durch [functions/school-year-reset/index.ts](functions/school-year-reset/index.ts), veröffentliche sie und stelle **Verify JWT with legacy secret auf AUS**. Der Code prüft jedes Mal den Nutzer-Token und die Admin-Rolle selbst.

Alternativ mit angemeldeter Supabase CLI:

```sh
supabase functions deploy school-year-reset --project-ref amwowtaxrgfcojlsxhzk --no-verify-jwt
```

Keine neuen Secrets, VAPID-Schlüssel oder Zeitpläne erforderlich. Supabase stellt Projekt-URL und Service-Role-Schlüssel automatisch bereit. Bestehende Push-Funktionen bleiben erhalten.

## 3. Klassen, Kurse und Jahrgänge einrichten

Die aktualisierte Webseite laden. Als Admin die Kachel **Klassen & Kurse** öffnen:

1. Klasse anlegen, beispielsweise **11BGUTI**, mit Jahrgangsstufe **11**.
2. Unter **Personen und Stundenplan zuordnen** die Klasse auswählen. Schüler mit Nutzerrolle als **Schüler** und Personen mit Lehrerrolle als **Lehrkraft** hinzufügen. Ein Konto kann mehreren Gruppen angehören. Die Zuordnung vergibt keine zusätzlichen Kontorollen.
3. Optional Wahlkurse anlegen, entweder mit einer zugehörigen Klasse oder klassenübergreifend. **Kurse haben eigene Mitglieder**; Klassenzugehörigkeit allein gewährt keinen Zugriff auf alle Wahlkurse.
4. Für die bisherige Klasse die vorhandene Vorlage mit **Bisherigen Stundenplan als Vorlage übernehmen** laden. Andere Klassen/Kurse können einen eigenen Plan erhalten. Die Vorlage ist die bisherige Stundenplan-Datei der Webseite, nicht ein automatisch aus anderen Konten kopierter Plan.
5. Im **Stundenplan** die gewünschte Klasse oder den Kurs wählen. Admin/Support sowie zugeordnete Lehrkräfte können den ausgewählten Plan bearbeiten. Der normale Nutzer ändert weiterhin nur seine Farben. Änderungen aus dem Stundeneditor werden gespeichert; für Sammeländerungen und Importe zusätzlich **Stundenplan speichern** verwenden.

In der Klassenansicht werden zugeordnete Kursstunden ergänzt. Zum Bearbeiten eines ergänzten Kurses diesen zuerst im Auswahlfeld direkt öffnen. Die serverseitige Zuordnung ist maßgeblich; lokale Kacheleinstellungen können keine Berechtigungen vergeben.

**Ohne Zuordnung werden keine fremden Klassenpläne angezeigt.** Nach der Einrichtung daher alle benötigten Schüler und Lehrkräfte zuordnen.

## 4. Hausaufgaben, Material und Prüfungen

- **Hausaufgaben:** Persönliche Aufgaben bleiben privat. Beim Veröffentlichen muss die Lehrkraft eine zugeordnete Klasse oder einen Kurs wählen. Alte, früher global geteilte Aufgaben bleiben erhalten, werden zunächst nur ihren Autoren angezeigt und können durch diese einer Gruppe zugeordnet werden. Sie werden nicht automatisch für neue Klassen freigegeben. Nächste-Stunde-Vorschläge nutzen den gewählten Gruppenplan.
- **Materialablage:** Zugeordnete Lehrkräfte und Admins stellen Dateien und/oder HTTPS-Links bereit. Unterstützt werden PDF, PNG/JPEG/WebP, TXT, DOCX, XLSX und ODT bis 10 MB. Nur berechtigte Gruppenmitglieder können Dateien abrufen; Download-Links gelten 60 Sekunden. Eigene Veröffentlichungen können berechtigte Autoren und Admins entfernen. Eine fehlgeschlagene Dateibereinigung bleibt in der Bereinigungswarteschlange nachvollziehbar.
- **Prüfungsplan:** Direkt im Stundenplan aufklappbar. Er zeigt Termine der ausgewählten Woche beziehungsweise auf Wunsch auch andere Wochen. Passende Unterrichtsstunden erhalten eine Prüfungsmarkierung. Lehrkräfte legen Prüfungen für ihre Gruppen an und können eigene Termine bearbeiten/löschen. Admins können alle bearbeiten. Die Prüfung auf andere Termine am Tag zählt auch Gruppen mit gemeinsam zugeordneten Schülern, ohne private Inhalte anderer Gruppen offenzulegen. Sie warnt, blockiert aber nicht automatisch die Speicherung.
- **Vertretungen:** Admin-Freigabe bleibt erforderlich. Schüler-Meldungen werden anhand zugeordneter Gruppen und passender Lehrer-/Zeit-/Wochentags-Einträge im Gruppenstundenplan verteilt. Für Wahlunterricht mit eigener Zielgruppe einen separaten Kursplan verwenden. Ältere, bereits versandte Meldungen werden nicht rückwirkend zurückgerufen.
- **Startseitenübersicht:** Nächste nicht ausgefallene Stunde, offene Aufgaben und ungelesene private Nachrichten. Sie aktualisiert sich alle 15 Sekunden. Beim Öffnen eines Chats werden geladene Nachrichten für die eigene Person als gelesen markiert.

Support kann Gruppenpläne und Gruppeninhalte zur Betreuung lesen und Gruppenpläne bearbeiten. Veröffentlichungen erfordern Admin-Rolle oder die passende Lehrerzuordnung. Private Chats bleiben weiterhin ausschließlich für ihre beiden Teilnehmer zugänglich, auch klassenübergreifend.

## 5. Kacheln direkt einstellen

- Rechtsklick auf eine Kachel: Farbe ändern, vor/zurück verschieben oder ausblenden.
- Rechte Maustaste gedrückt halten und über eine andere Kachel ziehen: Reihenfolge ändern.
- Escape oder außerhalb klicken: Menü schließen.
- Für Tastatur und Touch bleiben die Einstellungen unter Zahnrad → Startbildschirm mit Verschiebe-Schaltflächen verfügbar.

Die Kacheleinstellungen bleiben pro Konto in diesem Browser gespeichert. Die Übersicht ist unabhängig von ausgeblendeten Kacheln erreichbar.

## 6. Abschlussjahrgang und Reset

Unter **Klassen & Kurse → Abschlussjahrgang** legt ein Admin die letzte Jahrgangsstufe fest, standardmäßig 13. Jede Klasse erhält ihre eigene Jahrgangsstufe. Stufen werden beim Reset **nicht automatisch erhöht**; Klassen können anschließend manuell angepasst werden.

Unter **Schuljahres-Reset**:

1. Umfang wählen. Standardmäßig werden Schuljahresinhalte entfernt und Klassenpläne geleert. Konten, Rollen, Kontoeinstellungen, Hintergrundbilder sowie Klassen/Kurse und Mitgliedschaften bleiben erhalten.
2. Optional auch Klassen/Kurse samt Zuordnungen und/oder private Chats samt Supporttickets löschen.
3. Optional Schülerkonten des Abschlussjahrgangs mitlöschen. Die Vorschau nennt **alle betroffenen Namen und E-Mail-Adressen** nur für den ausführenden Admin. Dafür kommen nur Konten ausschließlich mit Nutzerrolle infrage, die einer Klasse der letzten Stufe und keiner Klasse einer anderen/unbekannten Stufe angehören. Konten mit Lehrer-, Support- oder Admin-Rolle und das ausführende Konto bleiben geschützt. Mitgelöschte Konten verlieren auch ihre privaten Chats und eigenen Tickets; die Vorschau zählt diese mit, selbst wenn die allgemeine Chat-Löschung nicht gewählt ist.
4. **Vorschau erstellen**, Zahlen und Namen prüfen. Es wurde bis hierhin nichts gelöscht. Noch ausstehende Bereinigungen eines vorherigen Löschvorgangs müssen zuerst abgeschlossen werden. Das Öffnen der Seite fragt nur den Status ab und löscht nichts. Die Vorschau gilt zehn Minuten. Ändern sich relevante Daten, muss eine neue Vorschau erstellt werden.
5. Erst nach exakter Eingabe des angezeigten Bestätigungstextes wird der Löschknopf freigegeben. Bei Bedarf vorher Datenbank und Dateien sichern. Die Löschung ist nicht rückgängig zu machen.
6. Die Funktion löscht Datenbankinhalte in einer Transaktion und bereinigt danach Dateien über die Storage API und freigegebene Abschlusskonten über die Auth API. Es wird kein Reset an echten Projektdaten aus der Entwicklungsumgebung ausgeführt.
7. Die Ergebnisansicht zeigt noch ausstehende Dateien/Konten. Mit **Bereinigung fortsetzen / Status prüfen** fortfahren, bis beide Zähler null sind. Nach einem fehlgeschlagenen API-Aufruf kann eine zweiminütige Lease ablaufen müssen. Rollenänderungen werden erneut geprüft; inzwischen zu Personal gewordene Konten werden geschützt. Ein SQL-Trigger schützt solche Konten zusätzlich bei der Auth-Löschung.

Die Reset-Optionen, Anzahl der betroffenen Daten und der ausführende Admin bleiben als interne Audit-Daten erhalten. Bestehende persönliche Push-Anmeldungen werden bei verbleibenden Konten beibehalten; alte Versandaufträge werden entfernt. Benutzeroberflächen und lokale persönliche Farben/Kacheleinstellungen werden nicht durch einen Datenbank-Reset aus den Browsern gelöscht.

## Lokale Validierung

```sh
PGLITE_MODULE_PATH=/pfad/zu/@electric-sql/pglite/dist/index.js node tests/school-database.mjs
node tests/school-reset-function.cjs
node tests/school-context-races.cjs
python tests/school-browser.py
```

Die SQL-Prüfung spielt alle Migrationen in eine isolierte Datenbank ein. Edge- und Browsertests simulieren externe APIs; es werden dabei keine Live-Konten oder Live-Dateien gelöscht. Echte Storage-/Auth-Bereinigung und Push-Zustellung müssen nach Einrichtung am eigenen Projekt geprüft werden, zunächst mit Testdaten.

### Fehler „UPDATE requires a WHERE clause“

Bei bereits eingerichteten Migrationen 017–019 zusätzlich `migrations/202610300020_school_revision_safe_update.sql` im SQL Editor ausführen. Der Fix ergänzt die Bedingung für den internen Änderungszähler und löscht keine Inhalte. Danach die Klassen-Seite neu laden. Beim Anlegen können bestehende Accounts direkt als Schüler oder Lehrkräfte ausgewählt werden; die jeweilige Kontorolle muss vorhanden sein.

### Schwerpunkt und Stundenplanrechte
Migration 021 ergänzt die optionale Klassenauswahl Informatik / Umwelttechnik / gemischt (auch später änderbar). Der feste Schwerpunkt wird im Stundenplan berücksichtigt. Stundenplanänderungen und JSON-Import sind nur Admins und zugeordneten Lehrkräften erlaubt; Support allein genügt nicht. Exporte bleiben für Schüler verfügbar. `stundenplan-vorlage.json` enthält die bisherige vollständige Vorlage im Importformat.

### Eigene nächste Stunde für Lehrkräfte
Migration 022 ergänzt `school_my_teaching`. Die Startseitenübersicht durchsucht für Lehrerkonten alle gespeicherten Klassen- und Kurspläne, liefert aber nur eigene Stunden und mögliche bestätigte Vertretungen zurück. Grundlage ist die Admin-Zuordnung unter Krankmeldungen → Name im Stundenplan. Kein unsicherer Abgleich über den Account-Anzeigenamen. Fehlende Zuordnung wird angezeigt. Schüleransicht bleibt unverändert.
