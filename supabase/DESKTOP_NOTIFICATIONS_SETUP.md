# Native Windows-Benachrichtigungen

## Windows-App 1.1.0 installieren

Diese Erweiterung benötigt einmalig die neue native Windows-App. Ein Webseiten-Update allein genügt nicht. Nach erfolgreichem Windows-Build findet sich der Installer unter [Windows-Downloads](https://github.com/Freddy-hubgit/stundenplan-app/releases/latest). Für Benachrichtigungen bitte die **Setup-EXE** verwenden: Der Installer legt auch den Windows-Startmenüeintrag für die App an. Die alte App vorher vollständig schließen.

Danach in der App anmelden und entweder unter **Hausaufgaben → Benachrichtigungen aktivieren** oder unter **Benachrichtigungen → Push für Meldungen aktivieren** einschalten. Bei der Aktivierung wird eine echte Windows-Bestätigung angezeigt. Erinnerungszeit: 16–22 Uhr (Berlin), in 5-Minuten-Schritten. Einstellungen gelten für das angemeldete Konto und diese Installation.

Die App prüft ungefähr jede Minute:

- Hausaufgaben für morgen: persönliche Aufgaben sowie für Schüler sichtbare Klassen-/Kursaufgaben. Erledigte Aufgaben ohne fehlende Pflichtabgabe werden übersprungen. Maximal eine Hausaufgaben-Erinnerung pro Berliner Kalendertag nach der gewählten Zeit.
- Neue ungelesene Unterrichtsmeldungen, wenn diese Kategorie separat aktiviert wurde. Alte Meldungen werden beim ersten Aktivieren nicht nachträglich als neue Windows-Meldungen ausgespielt.

## Hintergrundbetrieb

Bei aktivierten Benachrichtigungen schließt **X** nur das Fenster. Das Symbol im Windows-Infobereich bleibt bestehen. Anklicken öffnet das Portal. Über das Kontextmenü **Vollständig beenden** endet auch der Hintergrundbetrieb. Sind beide Kategorien deaktiviert, beendet das Schließen des Fensters die App wieder wie zuvor.

Für die Zustellung müssen die App laufen, der PC eingeschaltet und eine Internetverbindung vorhanden sein. Vollständig beendete App, Schlafmodus und ausgeschalteter PC erhalten in dieser Version keine Live-Zustellung. Es wird kein automatischer Windows-Autostart eingerichtet. Fokusmodus und Windows-Benachrichtigungseinstellungen können Toasts unterdrücken.

## Sicherheit und Speicherung

Abmelden oder Kontowechsel stoppt den vorherigen Kontext. Noch aktive Toasts werden bestmöglich geschlossen; bereits gelesene Betriebssystemmeldungen lassen sich nicht ungelesen machen. Klicks auf alte Toasts öffnen keine Inhalte eines anderen Kontos.

Die Hintergrundprüfung verwendet die vorhandene Supabase-Sitzung der App und die normalen Benutzerrechte. Es werden keine Service-Role-Schlüssel verwendet und keine zusätzlichen Zugangsdaten an den nativen Prozess übergeben. An die Windows-Brücke gelangen nur Konto-ID, aktivierte Kategorien und die anzuzeigenden Texte. Die IPC-Aufrufe sind auf das Hauptfenster und die feste Portal-Adresse bzw. die mitgelieferte lokale Startseite beschränkt; Benachrichtigungsklicks dürfen nur die Hausaufgaben oder Meldungsliste öffnen.

Aktivierung, Uhrzeit und Duplikatvermeidung werden pro Konto lokal gespeichert. Browser-Web-Push auf anderen Geräten bleibt davon unabhängig.

## Supabase

**Keine neue SQL-Migration, Edge Function, VAPID-Schlüssel oder sonstige Secrets erforderlich.** Die vorhandenen RPCs `hw_tasks_group` und `portal_notifications` müssen eingerichtet sein. Diese native Variante verwendet keinen externen Web-Push-Dienst. Die bestehende Browser-Push-Einrichtung kann parallel weiter genutzt werden.

## Tests

Automatisierte Tests prüfen Zeitberechnung inkl. Berliner Datums-/Sommerzeitgrenzen, Kontoisolation, Duplikatvermeidung, Opt-in/-out, IPC-Herkunftsprüfung, Tray-Lebenszyklus und Bedienung ohne Browser-Push-Registrierung. Die OS-Schnittstelle wird dabei simuliert; eine tatsächliche Zustellprüfung auf einem Windows-PC ist noch erforderlich. Der Windows-Installer wird durch den vorhandenen GitHub-Workflow gebaut und veröffentlicht.
