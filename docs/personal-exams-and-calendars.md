# Persönliche Prüfungseinträge und heutiger Tag

## Supabase

Für den Prüfungskalender muss die Grundeinrichtung 032–036 vorhanden sein (`supabase/setup/learning-suite.sql`). Falls nur 033 fehlt und die übrigen Migrationen bereits einzeln vorhanden sind, kann gezielt `supabase/migrations/202611110033_exam_calendar.sql` ausgeführt werden. Dieselben Migrationen nicht nochmals über das Gesamtpaket installieren.

Danach einmal `supabase/migrations/202611190038_personal_exams.sql` im SQL Editor ausführen. Sie ergänzt persönliche Prüfungseinträge. Die Migration läuft in einer Transaktion und prüft zuerst die Grundfunktionen. Keine neue Edge Function und kein neues Secret erforderlich. Vorhandene Klassenarbeiten werden beim Einrichten nicht verändert.

SQL Editor: https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new

## Nutzung und Rechte

- Schüler mit Nutzerrolle können Tage im Prüfungskalender auswählen und persönliche Arbeiten anlegen, bearbeiten und in den Papierkorb verschieben. Die Klassenzuordnung ist optional; angeboten werden eigene Schülerklassen.
- Persönliche Arbeiten sind ausschließlich im eigenen Account sichtbar – auch Fachlehrer und Admins erhalten keinen Lesezugriff. Das gilt auch für Suche und Papierkorb.
- Verbindliche Klassenarbeiten bleiben für Schüler schreibgeschützt. Die Datenbankgrenze von drei Arbeiten pro Woche und Klasse gilt weiterhin für diese gemeinsam geplanten Arbeiten. Persönliche Erinnerungen zählen nicht mit und können den Klassenplan nicht verändern.
- Konten mit Lehrer- und Nutzerrolle können zwischen einer gemeinsam sichtbaren Klassenarbeit und einem persönlichen Eintrag wählen.
- Persönliche Arbeiten werden beim Sprechstundenabgleich als eigener Termin berücksichtigt. Der bestätigte Schuljahres-Reset zählt und entfernt sie ebenfalls. Der Papierkorb erlaubt 30 Tage Wiederherstellung.

## Kalender

Portal-Kalender, Datumauswahl und Wochenübersicht im Vertretungsplan, Prüfungskalender, persönlicher Lehrerplan, Stundenplan und Sprechstunden kennzeichnen den heutigen Tag mit Rahmen und Hintergrundfarbe. Eigene Kalender verwenden die Schulzeitzone Europe/Berlin, einschließlich Datumswechsel und Sommerzeit. Der heute sichtbare Tag trägt `aria-current="date"`. Die browserinternen Datumsauswahlen verwenden weiterhin die native Heute-Markierung.

## Verwaltung

Klassen und Kurse, Schuljahres-Reset, Änderungsverlauf und Papierkorb sind direkt in den Verwaltungsreitern erreichbar. Verwaltungskonten erhalten dafür keine zusätzlichen Hauptmenükacheln mehr. Schüler und Lehrer ohne Verwaltungsrolle behalten ihre persönlichen Klassen- und Papierkorbzugänge. Support kann den eigenen zulässigen Papierkorb und die Klassenübersicht öffnen; Schuljahres-Reset und Änderungsverlauf bleiben Admins vorbehalten.

## Tests

- `tests/personal-exams-database.mjs`: private Rechte auch gegenüber Admins, gemeinsamer Wochenhöchstwert, eigene Klassen, Suche, Papierkorb, Sprechstunden und Reset.
- `tests/calendar-administration-browser.py`: Interaktion, Heute-Markierungen und eingebettete Verwaltungsbereiche mit simuliertem Backend.
- `tests/today.cjs`: Datumsgrenzen in Berlin und Sommerzeit.
