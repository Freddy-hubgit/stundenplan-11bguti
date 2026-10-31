# Zentrale Kachelsteuerung

Voraussetzung: Migrationen 001–028 sind eingerichtet. Einmalig [Migration 029](https://github.com/Freddy-hubgit/stundenplan-11bguti/blob/main/supabase/migrations/202610310029_portal_tiles.sql) vollständig im [SQL Editor](https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new) ausführen. Keine neuen Secrets oder Edge Functions nötig. Das Gesamtpaket 024–028 nicht erneut ausführen.

Admins finden danach **Verwaltung → Kacheln im Hauptmenü**. Jede Kachel kann einzeln zentral aus- oder eingeschaltet werden. Die Verwaltung bleibt erreichbar. Reine Supportkonten dürfen den globalen Status weder in der Oberfläche noch per Datenbankfunktion ändern.

Die Einstellung gilt für alle Konten, auch Admins. Rollenrechte und persönliche Einstellungen gelten zusätzlich: Aktivieren einer Lehrerkachel gibt Schülern keine Lehrerrechte; das Wiederaktivieren einer Kachel verändert die persönlichen Farben, Reihenfolge und Ausblendungen nicht. Zentral ausgeblendete Kacheln erscheinen auch nicht in der persönlichen Startseiten-Auswahl. Geöffnete Hauptmenüs aktualisieren den Status alle 30 Sekunden, beim Neuöffnen sofort.

Dies ist eine **Menüsteuerung**, keine Sperre der Funktion: Direkte Links, die Übersichtskarten sowie vorhandene Inhalte bleiben nutzbar. Es werden keine Daten gelöscht. Die Einstellungen bleiben beim Schuljahres-Reset erhalten. Änderungen erscheinen im Admin-Änderungsverlauf.

Bei einem Ladefehler bleibt die zuletzt verfügbare Konfiguration erhalten. Ohne zuvor geladene Konfiguration wird die normale rollenabhängige Ansicht angezeigt und ein Hinweis ausgegeben. So bleibt die Verwaltung auch bei einer noch fehlenden Migration erreichbar.
