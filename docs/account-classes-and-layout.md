# Klassenzuordnung in der Kontenverwaltung und flexible Seitenbreite

## Einrichtung

Einmal den vollständigen Inhalt von `supabase/migrations/202611190037_account_classes.sql` im SQL Editor ausführen. Vorausgesetzt sind die vorhandenen Rollen- und Klassenfunktionen (Migrationen 010 und 017). Die Abfrage kann erneut ausgeführt werden und verändert beim Einrichten keine bestehenden Zuordnungen. Keine neuen Secrets und keine Änderungen an den bestehenden Konto-Edge-Functions erforderlich.

SQL Editor: https://supabase.com/dashboard/project/amwowtaxrgfcojlsxhzk/sql/new

## Konten und Klassen

- Admin und Support können bei neuen Konten mit Nutzerrolle optional eine Schülerklasse auswählen.
- In der Kontoliste wird die Schülerklasse angezeigt. Unter Bearbeiten lässt sich die Klasse mit „Klasse speichern“ ändern oder mit „Keine Klasse“ entfernen. Der allgemeine Speichern-Button berücksichtigt eine geänderte Klasse ebenfalls.
- Die Zuordnung ersetzt nur bisherige Schülerzuordnungen zu Klassen. Kursmitgliedschaften und Lehrerzuordnungen bleiben erhalten. Ein Konto kann nicht über diese Auswahl von einer Lehrkraft zum Schüler derselben Klasse umgewandelt werden.
- Bestehende Mehrfachzuordnungen werden angezeigt und erst nach einer ausdrücklichen Auswahl ersetzt.
- Die Datenbank prüft die Verwaltungsrechte, Nutzerrolle, tatsächliche Klassenart und den zuvor geladenen Stand. Bei einer zwischenzeitlichen Änderung muss der Verwalter neu laden, statt fremde Änderungen zu überschreiben. Bestehende Prüfungs- und Sprechstundenregeln bleiben wirksam.
- Kontoanlage und Klassenzuordnung erfolgen über zwei Anfragen, weil die bestehenden Konto-Edge-Functions weiterverwendet werden. Falls nur die Zuordnung fehlschlägt, ist das Konto bereits angelegt: Das Formular wird geleert und das neue Konto mit der noch offenen Auswahl zum Bearbeiten geöffnet. Erneutes Speichern der Klasse legt kein zweites Konto an.

## Verwaltung

Die Verwaltung ist nach Konten & Rollen, Klassen & Kursen, Räumen & Buchbarkeit, Lehrerzuordnung, Hauptmenü-Kacheln, Schuljahres-Reset, Änderungsverlauf und Papierkorb gegliedert. Klassen und Räume verwenden eingebettet dieselben Komponenten wie die vorhandenen Seiten. Support sieht Konten, die Klassenübersicht und den eigenen zulässigen Papierkorb. Räume, Lehrerzuordnung, Kacheleinstellungen, Schuljahres-Reset und Änderungsverlauf bleiben Admins vorbehalten. Alle Bereiche sind direkt eingebettet; Vorschau und Löschbestätigung des Resets gelten weiterhin. Die entsprechenden Hauptmenükacheln entfallen bei Verwaltungskonten. Schüler und Lehrkräfte ohne Verwaltungsrolle behalten direkte Zugänge zu Klassen und Papierkorb.

## Layout

Die bisherigen maximalen Seitenbreiten wurden in den Portalbereichen, der Verwaltung, dem Stundenplan, dem Login und großen Einstellungs-/Bearbeitungsfenstern entfernt. Die Bereiche füllen die verfügbare Fensterbreite mit seitlichem Abstand aus. Tabellen können auf kleinen Fenstern innerhalb ihres Bereichs scrollen. Kontextmenüs, Chatblasen und Bildvorschauen bleiben an ihre Aufgabe angepasste Elemente und begrenzen nicht die Seitenbreite.

Geprüft: 25 Seiten bei 320, 1440 und 3840 Pixeln, Einstellungen, eingebettete Klassen-/Raumverwaltung, Kontoanlage mit Klassenzuordnung, Fehlerbehandlung ohne doppelte Kontoanlage, Support-Zugriff, Schutz von Lehrer-/Kurszuordnungen und konkurrierende Änderungen.
