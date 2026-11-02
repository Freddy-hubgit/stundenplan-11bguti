# Persönliche Hefte

## Einmalige Einrichtung

Voraussetzung: bisherige Migrationen **001–029** sind eingerichtet.

1. [Supabase SQL Editor öffnen](https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new).
2. Den vollständigen Inhalt von [Migration 030](https://github.com/Freddy-hubgit/stundenplan-11bguti/blob/main/supabase/migrations/202611020030_personal_notebooks.sql) einmal ausführen.
3. Nach dem GitHub-Deployment die Webseite neu laden. Die neue Kachel heißt **Meine Hefte**.

Keine neuen Secrets, Edge Functions oder Storage-Buckets erforderlich. Bereits erfolgreich ausgeführte Migrationen nicht erneut starten.

## Verwendung

- Ein **Allgemeines Heft** ist immer vorhanden.
- Fachhefte werden anhand der zugänglichen Klassen-/Kursstundenpläne und bereits gespeicherten Seiten angeboten. Weitere Fächer lassen sich über **Weiteres Fach → Fachheft beginnen** ergänzen. Ein eigenes Fach ohne Stundenplanbezug bleibt nach dem Neuladen erhalten, sobald seine erste Seite gespeichert wurde.
- Seiten enthalten Titel, Datum und bis zu 50.000 Zeichen Text. **Seite speichern** speichert im Konto über Supabase; dadurch stehen die Seiten auf anderen Geräten nach der Anmeldung zur Verfügung. Kein automatisches Offline-Speichern.
- **Seite oben anheften**, Suche nach Titel/Inhalt, Bearbeiten und Wechsel des Hefts im Editor sind möglich. Text wird als Text angezeigt, nicht als ausführbares HTML.
- **Heft als Text exportieren** lädt alle Seiten des ausgewählten Hefts herunter. Der Export ist unabhängig vom Suchfilter.
- Löschen erfordert eine zusätzliche Bestätigung. Bei ungespeicherten Änderungen warnt die Seite beim Wechsel des Hefts, beim Verlassen über das Portal und beim Schließen/Neuladen des Browserfensters.

## Rechte und Aufbewahrung

Jede Rolle erhält eigene private Hefte. Kein zusätzlicher Lese-/Schreibzugriff für Lehrer, Support oder Admins über die Portal-Funktionen. Direkter Tabellenzugriff für Browserrollen ist gesperrt; die RPCs prüfen den Eigentümer. Seitenrevisionen schützen vor dem unbemerkten Überschreiben einer zwischenzeitlichen Änderung auf einem anderen Gerät; bei Konflikt bleiben die Eingaben im Editor erhalten.

Hefte bleiben beim Schuljahres-Inhaltsreset erhalten. Das Löschen des Benutzerkontos entfernt auch dessen persönliche Heftseiten. Private Seiteninhalte werden nicht im Admin-Änderungsverlauf protokolliert. Die Kachel kann unter Verwaltung zentral ausgeblendet und persönlich wie die anderen Kacheln angeordnet/eingefärbt werden; die Transparenzeinstellung gilt ebenfalls.

## Prüfung

Lokale Datenbanktests prüfen Eigentümerrechte einschließlich verweigertem Adminzugriff, Revisionskonflikte, Löschen und Aufbewahrung beim Inhaltsreset. Browserprüfungen mit simulierten APIs decken Fach-/Allgemeinheft, Speicherung, Suche, Export, Anheften, Verschieben, Löschbestätigung, Warnung vor ungespeicherten Änderungen und mobile Darstellung ab. Kein Zugriff auf produktive Notizdaten und keine produktive Migration ausgeführt.
