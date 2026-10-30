# Krankmeldungen und Wunschvertretung aktivieren

Voraussetzung: Die bisherigen Migrationen 001–012 sind eingerichtet, insbesondere der Vertretungsplan und die Mehrfachrollen.

1. Im Supabase SQL Editor den vollständigen Inhalt von `migrations/202610300013_teacher_absences.sql` ausführen. Die Datei ist eine Transaktion; bei einem Fehler wird nichts teilweise übernommen. Sie erstellt private Meldungen, eine Zuordnung von Konten zu Stundenplannamen und eine persönliche Benachrichtigungsliste.
2. Die aktualisierte Webseite veröffentlichen. Als Admin die neue Kachel **Krankmeldungen** öffnen. Unter **Lehrerkonto zuordnen** jedes Konto mit Lehrerrolle einmal dem exakten Namen aus dem Stundenplan zuordnen. Ein Stundenplanname kann nur einem Konto zugeordnet sein. Bestehende offene Meldungen müssen vor einer Änderung der Zuordnung bearbeitet werden.
3. Die Lehrkraft öffnet **Krankmeldungen**, trägt Anfang, Ende und tägliche Uhrzeiten ein und kann eine **Wunschvertretung** nennen. Maximal 31 Tage, ab dem heutigen Tag (Europe/Berlin). Das Konto kann ausschließlich für seine zugeordnete Lehrkraft melden. Medizinische Einzelheiten werden nicht abgefragt.
4. Beim Absenden entstehen sofort verknüpfte Entfall-Einträge im Vertretungsplan. Im Stundenplan greifen die vorhandenen Regeln für betroffene Lehrkraft und Uhrzeiten. Bestehende überlappende Einträge werden nicht überschrieben; in diesem Fall erhält die Lehrkraft einen Hinweis und ein Admin muss den Konflikt prüfen.
5. Admins erhalten eine private Benachrichtigung und sehen den gewünschten Ersatz in der Meldung. Sie können den Entfall bestätigen oder eine Ersatzlehrkraft bestimmen. Der Wunsch ist keine Zusage. Die Entscheidung gilt für alle noch verknüpften Tage der Meldung; einzelne Stunden, Räume und Korrekturen bleiben im Vertretungsplan bearbeitbar. Eine entfernte Verknüpfung wird durch Bestätigen nicht neu angelegt.
6. Konten mit Nutzerrolle erhalten Unterrichtsänderungen in der neuen Kachel **Benachrichtigungen**. Die Meldung enthält nur Lehrkraft, Datum, Uhrzeit und Entfall/Vertretung, keinen Krankheitsgrund und keine Wunschvertretung. Das Portal hat einen gemeinsamen Klassenstundenplan; Nachrichten werden an alle Konten mit Nutzerrolle verteilt, die individuelle Kursauswahl gilt weiterhin für die Stundenplananzeige.

Die Benachrichtigungsliste aktualisiert sich bei geöffneter Webseite alle 15 Sekunden. Ein schwebender Zähler führt zu ungelesenen Meldungen; gelesene Meldungen bleiben in der Liste (letzte 100). Krankmeldungen können nur der meldenden Lehrkraft und Admins angezeigt werden. Support allein erhält keinen Zugriff auf Krankmeldungen, kann aber weiterhin den normalen Vertretungsplan bearbeiten.

## Prüfen

```sh
PGLITE_MODULE_PATH=/pfad/zu/@electric-sql/pglite/dist/index.js node tests/absence-database.mjs
python tests/absence-browser.py
```

Die Datenbankprüfung kontrolliert Zuordnung, Rechte, Privatheit, atomare Überlappungsprüfung und Unterrichtsänderungen. Die Browserprüfung simuliert die APIs; die Einrichtung muss im eigenen Supabase-Projekt ausgeführt werden.

## Zusätzlich Web-Push bei geschlossener Webseite (Migration 014)

Push für Unterrichtsmeldungen ist ein eigenes Opt-in pro Konto und Gerät. Hausaufgaben-Erinnerungen bleiben separat. Bereits gespeicherte VAPID-Schlüssel und das Cron-Geheimnis werden weiterverwendet; keine neuen Schlüssel erzeugen.

1. Im SQL Editor nach 013 den vollständigen Inhalt von [`migrations/202610300014_notification_push.sql`](migrations/202610300014_notification_push.sql) ausführen.
2. Unter Edge Functions eine neue Funktion **portal-notifications** erstellen und den gesamten Vorlageninhalt von `index.ts` durch [`functions/portal-notifications/index.ts`](functions/portal-notifications/index.ts) ersetzen. Deploy ausführen. **Verify JWT with legacy secret: AUS.** Der Code erlaubt Versand ausschließlich mit dem bereits vorhandenen `HOMEWORK_CRON_SECRET`.
3. Die Secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `HOMEWORK_CRON_SECRET` sowie Vault `homework_reminder_secret` müssen wie bei den Hausaufgaben eingerichtet sein. Die bestehende Funktion **homework-reminders** bleibt bestehen und liefert angemeldeten Browsern den öffentlichen Push-Schlüssel.
4. [`setup/portal-notification-cron.sql`](setup/portal-notification-cron.sql) im SQL Editor ausführen. Dieser zusätzliche Job prüft jede Minute auf neue Meldungen. Der Hausaufgaben-Zeitplan bleibt unverändert. Bei einem anderen Projekt die URL in der SQL-Datei anpassen.
5. Auf der aktualisierten Webseite **Benachrichtigungen → Push für Meldungen aktivieren** wählen und die Browser-Berechtigung erlauben. Auf jedem gewünschten Gerät wiederholen; auf iPhone/iPad über die zum Home-Bildschirm hinzugefügte Webseite.

Es werden nur neue, noch ungelesene Meldungen nach Aktivierung auf dem Gerät versendet, bis zu 24 Stunden nach Erstellung. Der Versand erfolgt in Batches mit maximal drei Versuchen und einer Lease gegen konkurrierende Worker. Push-Klicks öffnen ausschließlich die internen Seiten Krankmeldungen oder Stundenplan. Für Meldungen an Lehrkräfte/Admins enthält der Push-Text keine Namen oder privaten Wünsche; Details stehen nach Anmeldung in der Webseite. Nur das zuletzt aktive Konto eines Browsers erhält dort Push. Abgelaufene Geräte-Anmeldungen werden entfernt. Browser und Betriebssystem können die Zustellung verzögern oder unterdrücken.

Zum echten Test zuerst Push als Admin und als Schüler aktivieren, dann eine Lehrkraft krankmelden lassen. Admins erhalten eine Meldung; Schüler erhalten Entfall und nach Bestätigung gegebenenfalls die neue Vertretung. Dazu `portal-notifications`-Logs und den Cron-Job `portal-change-notifications` prüfen. In-App-Meldungen und Stundenplaneinträge funktionieren auch ohne Push-Einrichtung.

Weitere lokale Tests:

```sh
node tests/absence-push-functions.cjs
```

Der Push-Test simuliert das Netzwerk. Echte Endgeräte-Zustellung wurde nicht aus dieser Entwicklungsumgebung geprüft.
