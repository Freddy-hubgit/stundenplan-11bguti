export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type DayTrack = "Informatik" | "Umwelttechnik";

export type LanguageChoice = "Spanisch" | "Frei";

export const SCIENCE_SUBJECTS: readonly string[] = ["Chemie", "Physik", "Biologie"];

export interface Period {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface Lesson {
  subject: string;
  teacher: string;
  room: string;
  day: DayKey;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  track?: DayTrack;      // nur gesetzt, wenn die Stunde nur für einen Schwerpunkt gilt
  language?: "Spanisch"; // nur gesetzt, wenn die Stunde nur für Spanisch-Schüler gilt
  scienceGroup?: "Chemie" | "Physik" | "Biologie"; // nur nötig, wenn der Fachname vom Standardnamen abweicht (z.B. "Technische Mikrobiologie" -> "Biologie")
  cancelled?: boolean; // Stunde fällt aus – wird durchgestrichen angezeigt, zählt nicht als aktuelle/nächste Stunde
}


// Keep existing absence records with the former spelling associated with these lessons.
export function teacherKey(name: string): string {
  return name.trim().toLocaleLowerCase('de')
    .replace(/^her bendig$/, 'herr bendig')
    .replace(/^faru roos(?=,|$)/, 'frau roos');
}

export const DEFAULT_LESSONS: Lesson[] = [
    // Montag
    { subject: "Informatik", teacher: "Herr Hansen", room: "B115", day: "Mon", start: "07:30", end: "09:00", track: "Informatik" },
    { subject: "Umweltökonomie", teacher: "Herr Ott", room: "B118", day: "Mon", start: "08:15", end: "09:00", track: "Umwelttechnik" },
    { subject: "Technische Wissenschaft", teacher: "Frau von Willich", room: "B115", day: "Mon", start: "09:15", end: "10:45", track: "Informatik" },
    { subject: "Umweltökonomie", teacher: "Herr Ott", room: "B118", day: "Mon", start: "09:15", end: "10:45", track: "Umwelttechnik" },
    { subject: "Mathe", teacher: "Herr von Lindenfels", room: "B211", day: "Mon", start: "11:00", end: "12:30" },
    { subject: "Deutsch", teacher: "Herr Bendig", room: "B211", day: "Mon", start: "13:00", end: "13:45" },
    { subject: "Deutsch", teacher: "Herr Bendig", room: "B211", day: "Mon", start: "13:45", end: "14:30" },
    { subject: "Spanisch", teacher: "WEIT?", room: "A411", day: "Mon", start: "14:45", end: "16:15", language: "Spanisch" },

    // Dienstag
    { subject: "Chemie", teacher: "Frau Malcomess", room: "B207", day: "Tue", start: "07:30", end: "09:00", track: "Informatik" },
    { subject: "Technische Mikrobiologie", teacher: "HENR?", room: "B214", day: "Tue", start: "07:30", end: "09:00", track: "Informatik", scienceGroup: "Biologie" },
    { subject: "Informatik", teacher: "Herr Hansen", room: "B115", day: "Tue", start: "09:15", end: "10:45", track: "Informatik" },
    { subject: "Umwelttechnik", teacher: "Herr Meinecke", room: "B211", day: "Tue", start: "09:15", end: "10:45", track: "Umwelttechnik" },
    { subject: "Umwelttechnik", teacher: "Herr Meinecke", room: "B211", day: "Tue", start: "11:00", end: "11:45", track: "Umwelttechnik" },
    { subject: "Technische Wissenschaft", teacher: "Frau von Willich", room: "B115", day: "Tue", start: "11:00", end: "12:30", track: "Informatik" },
    { subject: "Religion", teacher: "Herr Lenz", room: "B208", day: "Tue", start: "13:00", end: "14:30" },
    { subject: "Spanisch", teacher: "WEIT?, CHAP?", room: "A411, A113", day: "Tue", start: "14:45", end: "16:15", language: "Spanisch" },

    // Mittwoch
    { subject: "Physik", teacher: "BORM?", room: "B211", day: "Wed", start: "07:30", end: "09:00", track: "Umwelttechnik" },
    { subject: "Deutsch", teacher: "Herr Bendig", room: "B211", day: "Wed", start: "09:15", end: "10:45" },
    { subject: "PoWi", teacher: "Herr van Dyck", room: "B211", day: "Wed", start: "11:00", end: "12:30" },
    { subject: "Englisch", teacher: "Frau Klebsch", room: "B211", day: "Wed", start: "13:00", end: "14:30" },

    // Donnerstag
    { subject: "Mathe", teacher: "Herr von Lindenfels", room: "B211", day: "Thu", start: "07:30", end: "09:00" },
    { subject: "Englisch", teacher: "Frau Klebsch", room: "B211", day: "Thu", start: "09:15", end: "10:45" },
    { subject: "Sport", teacher: "Frau Roos, Herr Sommer", room: "S3", day: "Thu", start: "11:00", end: "12:30" },
    { subject: "Physik", teacher: "Herr Bahmer", room: "B207", day: "Thu", start: "13:00", end: "14:30", track: "Informatik" },
    { subject: "Biologie", teacher: "BECK?", room: "A401", day: "Thu", start: "13:00", end: "14:30", track: "Umwelttechnik" },
    { subject: "Spanisch", teacher: "CHAP?", room: "A113", day: "Thu", start: "14:45", end: "16:15", language: "Spanisch" },

    // Freitag
    { subject: "Biologie", teacher: "JELI?", room: "A407", day: "Fri", start: "07:30", end: "09:00", track: "Informatik" },
    { subject: "Chemie", teacher: "Herr Meinecke", room: "B211", day: "Fri", start: "07:30", end: "09:00", track: "Umwelttechnik" },
    { subject: "Informatik", teacher: "Herr Hansen", room: "B115", day: "Fri", start: "09:15", end: "10:45", track: "Informatik" },
    { subject: "Umwelttechnik", teacher: "Herr Meinecke", room: "B211", day: "Fri", start: "09:15", end: "10:45", track: "Umwelttechnik" },
    { subject: "Geschichte", teacher: "Frau Klebsch", room: "B211", day: "Fri", start: "11:00", end: "12:30" },
  ];
