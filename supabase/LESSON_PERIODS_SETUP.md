# Auswahl nach Unterrichtsstunden

Keine neue SQL-Migration erforderlich. Die bestehenden Funktionen speichern weiterhin die zugehörigen Uhrzeiten; bestehende Buchungen und Meldungen bleiben unverändert.

Die gemeinsame Stundentafel entspricht dem bisherigen Stundenplan:

| Stunde | Uhrzeit |
| --- | --- |
| 1 | 07:30–08:15 |
| 2 | 08:15–09:00 |
| 3 | 09:15–10:00 |
| 4 | 10:00–10:45 |
| 5 | 11:00–11:45 |
| 6 | 11:45–12:30 |
| 7 | 13:00–13:45 |
| 8 | 13:45–14:30 |
| 9 | 14:45–15:30 |
| 10 | 15:30–16:15 |

**Ab Stunde / Bis Stunde** gibt es bei Raumbuchungen, Krankmeldungen einschließlich Zeitraumkorrekturen, Vertretungen, Prüfungen und im Stundeneditor. Die Uhrzeiten werden automatisch übernommen. Mehrere Stunden umfassen die dazwischenliegenden Pausen; getrennte Stunden ohne Zwischenraum bitte separat buchen. Eine neue Krankmeldung bzw. Vertretung umfasst standardmäßig den gesamten Unterrichtstag (Stunden 1–10).

Für Termine außerhalb der Stundentafel und alte Einträge mit anderen Zeiten gibt es **Abweichende Uhrzeiten**. Alte Zeiträume werden nicht automatisch gerundet oder verändert. Der Wechsel zurück zur Stundenauswahl ist eine ausdrückliche Eingabe und zeigt die übernommenen Zeiten an.

Kalendertermine und Videokonferenzen behalten ihre freie Zeitauswahl. Berechtigungen, Konfliktprüfung und Bestätigung von Krankmeldungen bleiben bestehen.

Alle betroffenen Eingaben und das Stundenplanraster verwenden dieselbe Definition in `src/app/school-periods.ts`. Falls die Schule andere Stundenzeiten verwendet, ist dort nur eine gemeinsame Anpassung erforderlich; bereits gespeicherte Uhrzeiten werden dadurch nicht nachträglich verschoben.
