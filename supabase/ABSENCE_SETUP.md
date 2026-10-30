# Krankmeldungen: Antrag und Admin-Bestätigung

Die aktuelle Version veröffentlicht eine Krankmeldung erst nach Bestätigung durch einen Admin. Lehrkräfte beantragen **Entfall** oder eine **Wunschvertretung** und können den Wunsch bei einem offenen Antrag ändern.

## Bestehende Installation aktualisieren

Wenn die Migrationen 013 und 014 bereits erfolgreich ausgeführt wurden, nur den vollständigen Inhalt von [`migrations/202610300015_absence_approval.sql`](migrations/202610300015_absence_approval.sql) im Supabase SQL Editor ausführen und danach die aktualisierte Webseite laden. Bestehende Push-Schlüssel, Edge Functions und Zeitpläne bleiben unverändert.

Die Migration verbirgt auch bestehende, noch nicht bestätigte Einträge aus der alten Version. Zugehörige, eindeutig erkennbare systemgenerierte Schüler-Meldungen werden entfernt, einschließlich ausstehender Push-Aufträge. Bereits auf einem Endgerät zugestellte Nachrichten können nicht zurückgerufen werden. Bestätigte Einträge und manuelle Vertretungsplaneinträge bleiben veröffentlicht.

## Neue Installation

Voraussetzung: Migrationen 001–012 sind eingerichtet. Anschließend in dieser Reihenfolge ausführen:

1. `migrations/202610300013_teacher_absences.sql`
2. `migrations/202610300014_notification_push.sql`
3. `migrations/202610300015_absence_approval.sql`

Danach Push wie unten beschrieben aktivieren.

## Ablauf in der Webseite

1. Als Admin unter **Krankmeldungen → Lehrerkonto zuordnen** das Konto mit Lehrerrolle dem exakten Namen im Stundenplan zuordnen. Nur dieses Konto kann für diese Lehrkraft melden.
2. Die Lehrkraft wählt den Zeitraum (maximal 31 Tage ab heute, deutsche Zeit), tägliche Uhrzeiten und **Entfall beantragen** oder **Wunschvertretung beantragen**. Bei Wunschvertretung ist eine andere Lehrkraft erforderlich. Medizinische Details werden nicht abgefragt.
3. Mit **Antrag senden** werden nur Admins benachrichtigt. Der Schüler-Stundenplan, Schüler-Meldungen und Schüler-Push bleiben bis zur Bestätigung unverändert.
4. Unter **Meine Meldungen → Antrag ändern** kann die Lehrkraft bei einem offenen Antrag zwischen Entfall und Wunschvertretung wechseln. Admins werden erneut benachrichtigt. Nach Bestätigung kann die Lehrkraft den Antrag nicht mehr ändern und muss einen Admin kontaktieren.
5. Admins prüfen den Wunsch und bestätigen Entfall oder eine Ersatzlehrkraft. Sie können eine andere Entscheidung als beantragt treffen. Erst jetzt werden die betroffenen Tage veröffentlicht und Schüler benachrichtigt. Ein inzwischen angelegter überlappender Vertretungsplaneintrag blockiert die Bestätigung; er wird nicht überschrieben.
6. Einzelne Stunden und Räume können nach Bestätigung im **Vertretungsplan** bearbeitet werden. Erneute Bestätigung einer Meldung gilt für alle noch verknüpften Einträge. Entfernte bestätigte Einträge werden nicht automatisch neu angelegt.

Konten mit Nutzerrolle erhalten Unterrichtsänderungen, ohne Krankheitsgrund oder private Wünsche. Das Portal hat einen gemeinsamen Klassenstundenplan; Meldungen gehen an alle Konten mit Nutzerrolle. Die individuelle Kursauswahl gilt weiterhin für die Stundenplananzeige. Support allein sieht keine privaten Krankmeldungen und kann sie nicht bestätigen; die bisherige Verwaltung des normalen Vertretungsplans bleibt verfügbar.

Krankmeldungen sind in drei Bereiche gegliedert: **Neue** enthält offene Anträge vor dem ersten Tag; **Aktuelle** enthält bestätigte zukünftige und bereits begonnene Meldungen; **Vergangene** enthält alle Meldungen nach ihrem letzten Tag. Der letzte Tag zählt vollständig zum Zeitraum, maßgeblich ist Europe/Berlin. Die Einteilung ändert keine Freigabe: Ein offener Antrag unter Aktuelle bleibt für Schüler unsichtbar.

Die Benachrichtigungsliste aktualisiert sich alle 15 Sekunden. Die letzten 100 Meldungen sind in der Kachel Benachrichtigungen sichtbar.

## Lokale Prüfung

```sh
PGLITE_MODULE_PATH=/pfad/zu/@electric-sql/pglite/dist/index.js node tests/absence-approval-database.mjs
python tests/absence-browser.py
```

Die Tests prüfen private offene Anträge, Wunschwechsel, Admin-Freigabe, Konflikte, ältere Clients, vorhandene offene Einträge sowie Schüler-Stundenplan und Push erst nach Freigabe. Browser- und Push-Netzwerkzugriffe werden simuliert; eine echte Gerätezustellung muss im eingerichteten Projekt geprüft werden.

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
