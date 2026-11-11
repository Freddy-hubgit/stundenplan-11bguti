# Noten, Prüfungen, Sprechstunden, Suche und Papierkorb

## Einmalige Supabase-Einrichtung

Die vorhandene Einrichtung bis einschließlich Migration 030 muss vorhanden sein. Migration 031 (Profilbilder) ist davon unabhängig. Im Supabase SQL Editor den **gesamten Inhalt** von `supabase/setup/learning-suite.sql` als neue Abfrage ausführen. Das Paket enthält die Migrationen 032–036 in einer Transaktion: entweder dieses Paket oder dieselben Migrationen einzeln in der richtigen Reihenfolge ausführen. Keine zusätzlichen Edge Functions oder Secrets erforderlich. Die Einrichtung löscht keine bestehenden Unterrichtspläne oder Inhalte.

SQL Editor: https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new

Die Webseite aktualisieren und im Hauptmenü die neuen Kacheln öffnen. Admins können sie wie andere Kacheln zentral deaktivieren. Persönliche Reihenfolge, Farben und Transparenz funktionieren weiter.

## Notenübersicht

Schüler benötigen die Nutzerrolle und eine Schülerzuordnung zu ihrer Klasse bzw. ihrem Kurs. Lehrer benötigen die Lehrerrolle, eine Lehrerzuordnung zur Gruppe und die Zuordnung ihres Stundenplannamens unter Verwaltung. Der gespeicherte Gruppenstundenplan muss ihr Fach und ihren Lehrernamen enthalten. Dadurch sehen Lehrer nur Noten ihrer zugeordneten Schüler in ihrem eigenen Unterrichtsfach. Admins können Noteneinträge verwalten, erhalten aber ebenfalls keine Selbsteinschätzung vor einer eigenen Noteneingabe.

Noten 1–6 und Punkte 0–15 werden getrennt berechnet. Die Durchschnitte verwenden die Eintragsgewichtung und, sofern vorhanden, die Lehrernote. Das ist eine Rechenhilfe, keine verbindliche Zeugnisnote. Schüler können eigene Einträge anlegen. Zuständige Lehrer dürfen Schülernoteneinträge bearbeiten und eine eigene Note speichern. Lehrernoten können Schüler nicht überschreiben. Vorhandene Einträge behalten Person, Fach, Gruppe, Halbjahr und Notensystem, um Bewertungen nicht nachträglich einem anderen Kontext zuzuordnen.

Die Selbsteinschätzung ist immer freiwillig für den jeweiligen Schüler verfügbar, auch bei noch leerer Note. Selbsteinschätzung und Lehrernoten liegen in getrennten, für direkte Clientabfragen gesperrten Tabellen. Ein Lehrer bekommt die Selbsteinschätzung erst zurück, nachdem er **seine eigene** Note für den Eintrag gespeichert hat. Das gilt auch dann, wenn eine andere Lehrkraft bereits bewertet hat. Schüler dürfen die eigene Selbsteinschätzung aktualisieren. Gelöschte Noteneinträge werden endgültig gelöscht; die Oberfläche verlangt dafür eine Bestätigung.

## Persönlicher Lehrerplan

„Mein Unterricht“ zeigt eine Wochenansicht aller eigenen Stunden über alle gespeicherten Klassen und Kurse. Grundlage ist die bereits vorhandene Lehrerzuordnung und die bisherige Suche nach eigenem Unterricht. Es wird kein zweiter Unterrichtsplan gespeichert. Bestätigte Ausfälle und Vertretungen werden bei jeder Wochenansicht berücksichtigt. Der Klassenstundenplan bleibt separat bearbeitbar.

## Prüfungskalender

Lehrer sehen die Klassenarbeiten klassenübergreifend und können Arbeiten für Klassen eintragen; Schüler sehen nur freigegebene Gruppen. Datum, Fach, Klasse, Unterrichtszeiten, Raum und Hinweise werden im Monatskalender und einer nach Datum oder Klasse sortierbaren Liste angezeigt. Dieselben Prüfungen erscheinen weiterhin im Stundenplan.

Die Datenbank begrenzt auf **drei Arbeiten je Klasse und ISO-Kalenderwoche (Montag–Sonntag)**. Zugeordnete Kursarbeiten zählen bei ihren betroffenen Klassen mit. Die Prüfung gilt für Anlegen, Bearbeiten, Import über dieselben Tabellen und Wiederherstellen aus dem Papierkorb; ein Transaktionslock serialisiert konkurrierende Änderungen. Bereits vorhandene Wochen mit mehr als drei Arbeiten werden durch die Einrichtung nicht gelöscht. Weitere Schreibvorgänge in einer solchen Woche können erst nach einer Umplanung erfolgen. Auch Änderungen an Kurs-/Klassenzuordnungen prüfen die künftige Wochenbelegung, damit eine nachträgliche Zuordnung die Grenze nicht umgehen kann.

Lehrer bearbeiten nur selbst eingetragene Arbeiten, Admins alle. Die Selbsteinschätzung enthält keine Prüfungsdaten; beide Bereiche sind unabhängig.

## Sprechstunden

Lehrer bieten Termine für höchstens 60 Minuten an. Schüler buchen für sich selbst und geben ein Gesprächsthema an. Vor dem Speichern werden beide Personen auf Kalendertermine, Unterricht einschließlich bestätigter Ausfälle/Vertretungen, Prüfungen, Raumbuchungen und bestehende Sprechstunden geprüft. Berührende End-/Anfangszeiten gelten nicht als Überschneidung. Die Buchung und spätere kollidierende Terminänderungen werden in der Datenbank geprüft. Fremde Gesprächsthemen, Buchungs-IDs und Schülernamen werden anderen Schülern und unbeteiligten Admins nicht geliefert.

Der bisherige Portal-Kalender hat keine persönliche Teilnehmerliste. Bestehende Einträge ohne Ersteller werden als gemeinsame Sperrzeiten behandelt. Neue Kalendereinträge werden dem Ersteller zugeordnet. Lehrer können nun eigene Kalendertermine anlegen und bearbeiten; Support und Admin behalten ihre bisherigen Verwaltungsrechte. Externe Kalender wie Outlook oder Google werden nicht synchronisiert. Wiederkehrender Unterricht wird wie im vorhandenen Stundenplan wöchentlich betrachtet; es gibt keine neue automatische Ferienberechnung.

## Suche

Durchsucht werden eigene Hefte, sichtbare Materialien und Hausaufgaben, zulässige Prüfungen und Kalendertermine. Die Suche verwendet die bestehenden Berechtigungsfunktionen; es wird kein zusätzlicher öffentlich zugänglicher Suchindex erstellt. Mindestens zwei Zeichen, höchstens 50 Treffer pro Abfrage. Noten, versteckte Selbsteinschätzungen und private Chats werden nicht indexiert. Gelöschte Inhalte erscheinen nicht in den Ergebnissen. Suchtreffer verlinken in den passenden Bereich; Heftseiten und Prüfungstage werden direkt ausgewählt.

## Papierkorb und Schuljahreswechsel

Neu über die Oberfläche entfernte Heftseiten, Materialien, Prüfungen und Hausaufgaben sind 30 Tage wiederherstellbar. Vor der Einrichtung endgültig gelöschte Daten können nicht rekonstruiert werden. Hefte bleiben auch gegenüber Admins privat. Klasseninhalte erfordern weiterhin die aktuellen Bearbeitungsrechte. Materialdateien bleiben während der Wiederherstellbarkeit erhalten; die Storage-Regeln blockieren deren vorzeitiges Löschen. Bei endgültigem Löschen werden Dateibereinigungsaufträge in der bestehenden Cleanup-Warteschlange hinterlegt. Diese kann ein Admin im Schuljahresbereich über die vorhandene Bereinigungsfunktion abarbeiten; dafür muss die bereits bestehende Edge Function `school-year-reset` eingerichtet sein. Ohne diese bleiben zur endgültigen Bereinigung vorgemerkte Binärdateien gespeichert. Es ist keine neue Edge Function nötig.

Der bestätigte Schuljahres-Reset berücksichtigt neue Noten, Sprechstunden und Papierkorbeinträge in Vorschau und Änderungsprüfung und löscht diese zusammen mit den bisherigen Schuljahresinhalten. Er kann nicht über den Papierkorb rückgängig gemacht werden. Lebende persönliche Hefte bleiben wie bisher erhalten.

## Prüfung

- `PGLITE_MODULE_PATH=… node tests/learning-suite-database.mjs`: Rechte, getrennte Selbsteinschätzung, Klassen-/Wochenlimit, Papierkorb, Suche, Terminabgleich und Reset.
- `USE_LEARNING_PACKAGE=1 PGLITE_MODULE_PATH=… node tests/learning-suite-database.mjs`: dieselben Regeln mit dem einmaligen SQL-Gesamtpaket.
- `python tests/learning-suite-browser.py`: Bedienung für Schüler und Lehrer mit simulierten Supabase-Antworten.
- Angular-Produktionsbuild und bestehende Integrationsprüfungen.
