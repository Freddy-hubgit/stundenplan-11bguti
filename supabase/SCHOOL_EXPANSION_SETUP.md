# Krankmeldungen, Gruppenchats, Abgaben, Räume und Änderungsverlauf

## Einmalige Aktivierung

Voraussetzung: Die bisherigen Migrationen **001–023** sind erfolgreich eingerichtet.

1. [Supabase SQL Editor öffnen](https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new).
2. Den vollständigen Inhalt von [school-expansion.sql](https://github.com/Freddy-hubgit/stundenplan-11bguti/blob/main/supabase/setup/school-expansion.sql) einfügen und einmal ausführen. Das Paket enthält Migrationen **024–028 in einer gemeinsamen Transaktion**. Alternativ diese fünf Migrationsdateien einzeln in aufsteigender Reihenfolge ausführen, aber nicht zusätzlich zum Paket.
3. Nach dem GitHub-Deployment die Webseite neu laden.

**Keine neuen Secrets, Edge Functions oder Cronjobs notwendig.** Keine Tabellen manuell löschen. Bei einem SQL-Fehler den Fehlertext mitteilen; das gemeinsame Paket wird bei einem Fehler vollständig zurückgerollt. Die SQL-Skripte nicht erneut ausführen, wenn sie bereits erfolgreich abgeschlossen wurden.

## Krankmeldungen korrigieren

Unter **Krankmeldungen → Zeitraum / einzelne Tage ändern**:

- Lehrkräfte dürfen ihren eigenen noch offenen Antrag verkürzen oder verlängern, tägliche Uhrzeiten ändern und einzelne Tage ausnehmen. Bis zur Admin-Bestätigung ändert sich für Schüler weiterhin nichts.
- **Support** darf auch bestätigte Meldungen korrigieren. Die bestätigte Entscheidung (Entfall oder Ersatzlehrkraft) gilt für die verbleibenden Tage, einschließlich einer Verlängerung. Reine Admin-Accounts dürfen weiterhin bestätigen, aber keine bestätigten Zeiträume korrigieren oder ganze Meldungen zurücknehmen. Konten mit mehreren Rollen besitzen die Vereinigung ihrer Rechte.
- Ein angehakter Ausnahmetag bedeutet: Lehrkraft ist an diesem Tag wieder da, regulärer Unterricht. Mindestens ein Abwesenheitstag muss verbleiben; für die vollständige Rücknahme den vorhandenen Support-Button verwenden.
- Konflikte mit anderen Meldungen, Vertretungen oder bestehenden Raumbuchungen werden abgelehnt. Die bisherige Meldung bleibt dabei vollständig erhalten.
- Betroffene Nutzer erhalten die bestehenden In-App-Meldungen und bei aktivierter Push-Einrichtung auch Push. Bereits zugestellte Push-Nachrichten lassen sich nicht zurückrufen.

## Gruppenchats

Unter **Nachrichten → Gruppenchats** können alle Rollen Gruppen mit **2–50 Mitgliedern** erstellen. Name, mindestens eine weitere Person und erste Nachricht sind erforderlich. Ein bloßes Öffnen des Formulars erzeugt keine Gruppe.

Nur aktuelle Mitglieder lesen und schreiben; Admin oder Support erhalten keinen zusätzlichen Zugriff. Neue Mitglieder können den bisherigen Verlauf lesen. Entfernte Mitglieder verlieren den Zugriff über das Portal, bereits gelesene oder kopierte Nachrichten lassen sich nicht zurückholen. Der Ersteller kann umbenennen, Mitglieder hinzufügen/entfernen und die Gruppe mit Bestätigung für alle löschen. Andere Mitglieder können austreten. Ein Eigentümerwechsel ist nicht enthalten. Wird das Erstellerkonto gelöscht, wird auch seine Gruppe gelöscht.

Ungelesene Gruppennachrichten zählen in der Startseitenübersicht mit. Das reine Lesen eines Gruppenchats macht eine Schuljahres-Reset-Vorschau nicht ungültig.

## Abgabeübersicht

**Abgabeübersicht** steht Admins und den zugeordneten Lehrkräften zur Verfügung. Sie zeigt aktive Klassen-/Kursaufgaben mit erforderlicher Abgabe, die Zahl erwarteter/abgegebener/geprüfter Einreichungen sowie alle aktuell zugeordneten Schüler, einschließlich fehlender Abgaben. Filter: alle, fehlend, ungeprüft.

Text, Link und private Datei können eingesehen werden. Rückmeldung speichern markiert die Abgabe als geprüft, auch bei leerem Kommentar. Schüler sehen ihre eigene Rückmeldung unter **Hausaufgaben → Abgabe bearbeiten**. Eine erneute Einreichung entfernt die bisherige Prüfung/Rückmeldung, damit sie erneut geprüft werden kann. Keine Notenvergabe, keine Einsicht in fremde Klassen und keine öffentliche Rückmeldung.

## Raumbuchung

Admins verwalten Räume unter **Verwaltung → Räume und Buchbarkeit verwalten** oder direkt in **Raumbuchung → Räume verwalten**. Raumname muss dem Stundenplan entsprechen, z. B. `B211`. Räume sind anfangs nicht freigegeben und werden erst durch das Häkchen buchbar. Deaktivieren verhindert neue Reservierungen; vorhandene Reservierungen bleiben bestehen und können von Eigentümer/Admin storniert werden.

Alle angemeldeten Konten können freigegebene Räume im Voraus für bis zu 12 Stunden am selben Berliner Kalendertag reservieren (maximal 366 Tage voraus). Buchungen und regulärer Unterricht einschließlich bestätigter Vertretungen werden gemeinsam auf Überschneidungen geprüft. Direkt aneinander anschließende Buchungen sind erlaubt. Entfallene Unterrichtsanteile geben einen Raum frei. Unterricht in anderen Räumen belegt den Ersatzraum.

Spätere Änderungen am Stundenplan/Vertretungsplan dürfen bestehende Buchungen ebenfalls nicht übergehen. Bei Konflikt zuerst die Raumbuchung prüfen bzw. stornieren. Die Prüfung erfolgt am Transaktionsende, damit eine Korrektur aus mehreren zusammengehörigen Schritten atomar bleibt.

Andere Nutzer sehen bei fremden Reservierungen nur **Reserviert**, keine privaten Buchungstitel. Eigentümer und Admins sehen den Titel und können stornieren. Es gibt keine Zahlung oder externe Vermietungsabwicklung.

## Änderungsverlauf

**Verwaltung → Änderungsverlauf** / eigene Admin-Kachel. Protokolliert werden Änderungen **ab Aktivierung**, mit Akteur, Uhrzeit und Vorher/Nachher:

- Stundenpläne, Klassen/Kurse und Mitgliedschaften
- Kontorollen (keine Passwörter, keine Profil-E-Mail- oder Namensänderungen)
- Krankmeldungen und Vertretungen
- Räume und Raumbuchungen

Keine Chatnachrichten, Aufgabenantworten oder Dateiinhalte im Verlauf. Nur Admins dürfen ihn lesen. Filter und seitenweises Nachladen (50 Einträge) vorhanden.

**Rückgängig** ist für Stundenplan-Änderungen verfügbar. Die Datenbank prüft aktuelle Version und Änderungshistorie: Sobald inzwischen weitergearbeitet wurde, wird die Aktion abgelehnt. Die Wiederherstellung wird selbst protokolliert und muss bestehende Raumbuchungen beachten. Rollen, Kontolöschungen, Krankmeldungen und Buchungen werden bewusst über ihre jeweiligen Fachfunktionen korrigiert; dafür gibt es keinen pauschalen Wiederherstellen-Button.

## Schuljahres-Reset

Die vorhandene Vorschau zählt neue Raumbuchungen und betroffene Gruppenchats mit. Raumbuchungen werden beim bestätigten Reset entfernt; Raumdefinitionen/Buchbarkeit und Änderungsverlauf bleiben erhalten. Gruppenchats werden nur bei der bereits vorhandenen Chat-Löschoption entfernt, oder wenn ihr Erstellerkonto im gewählten Abschlussjahrgang gelöscht wird. Feedback verschwindet mit den gelöschten Aufgaben. Vorschau und Sicherheitsbestätigung bleiben erforderlich.

## Prüfung

Produktionsbuild und lokale Browser-/Datenbanktests decken Berechtigungen, Ausschlusstage, Gruppenzugriff, fehlende Abgaben, Rückmeldungen, Unterrichts-/Buchungskonflikte, bedingtes Rückgängigmachen und Reset-Integration ab. Browser-Tests verwenden API-Mocks, Datenbanktests eine isolierte PostgreSQL-Umgebung. Es wurden keine Live-Daten gelöscht und keine Migration im produktiven Supabase ausgeführt.
