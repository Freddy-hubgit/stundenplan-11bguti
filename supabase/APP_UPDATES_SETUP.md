# Web- und Windows-Updates getrennt prüfen

Unter **Hauptmenü → Einstellungen → App-Update → Auf Updates prüfen** prüft die Windows-App beide Projekte:

- **Weboberfläche:** die veröffentlichte `assets/version.json` von `stundenplan-11bguti`. Ein Quellcode-Commit allein gilt nicht als verfügbares Webupdate.
- **Windows-Programm:** das neueste stabile veröffentlichte GitHub-Release von `stundenplan-app`, mit vollständig hochgeladenem Setup-Installer. Reine Quellcodeänderungen und unfertige Releases werden nicht als installierbares Programmupdate angeboten.

Die Ergebnisse werden getrennt angezeigt. „Weboberfläche aktuell“ bedeutet nicht mehr, dass auch das Windows-Programm aktuell ist. Wenn eine Prüfung fehlschlägt, bleibt die andere nutzbar.

**Weboberfläche laden und neu starten** aktualisiert die Webansicht. **Windows … herunterladen** öffnet den Installer-Download im Browser. Das Programm anschließend vollständig beenden (bei Hintergrundbetrieb über das Symbol im Windows-Infobereich), dann den Installer starten. Der Installer wird nicht unbemerkt heruntergeladen oder ausgeführt.

Ab Windows-App **1.1.1** wird die installierte Programmversion direkt vom nativen Programm gemeldet. Bei älteren Versionen kann sie aus der vorhandenen App-Kennung gelesen werden. Falls beides nicht möglich ist, wird die Version ausdrücklich als unbekannt behandelt und der verfügbare Installer angeboten, ohne fälschlich „aktuell“ zu melden.

Die Prüfung vergleicht numerische Versionsnummern, z. B. ist 1.10.0 neuer als 1.9.0. Ältere Releases führen nicht zu einer Aufforderung zum Downgrade. Downloadlinks werden auf das feste App-Repository und vollständig veröffentlichte Setup-EXE-Dateien begrenzt.

Keine Supabase-Migration oder zusätzlichen Secrets erforderlich. Die bestehende native Benachrichtigungsfunktion und Webupdate-Prüfung bleiben erhalten.
