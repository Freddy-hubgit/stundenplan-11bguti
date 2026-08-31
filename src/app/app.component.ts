import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';

/* =====================================================================
   TYPEN
   ===================================================================== */

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type DayTrack = "Informatik" | "Umwelttechnik";

type LanguageChoice = "Spanisch" | "Frei";

const SCIENCE_SUBJECTS: readonly string[] = ["Chemie", "Physik", "Biologie"];

interface Period {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

interface Lesson {
  subject: string;
  teacher: string;
  room: string;
  day: DayKey;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  track?: DayTrack;      // nur gesetzt, wenn die Stunde nur für einen Schwerpunkt gilt
  language?: "Spanisch"; // nur gesetzt, wenn die Stunde nur für Spanisch-Schüler gilt
  scienceGroup?: "Chemie" | "Physik" | "Biologie"; // nur nötig, wenn der Fachname vom Standardnamen abweicht (z.B. "Technische Mikrobiologie" -> "Biologie")
}

interface DayDef {
  key: DayKey;
  label: string;
  short: string;
  jsIdx: number; // JS Date.getDay() Index (0 = So ... 6 = Sa)
}

interface SubjectColor {
  border: string;
  bg: string;
}

interface PositionedLesson extends Lesson {
  top: number;      // in %
  height: number;   // in %
  isLive: boolean;
  color: SubjectColor;
  sourceIndex: number; // Index in this.lessons – wird zum Bearbeiten/Löschen gebraucht
}

interface DayColumn {
  def: DayDef;
  date: Date;
  isToday: boolean;
  lessons: PositionedLesson[];
}

interface TimeMark {
  minutes: number;
  label: string;
  top: number; // in %
}

interface NextLessonInfo {
  lesson: Lesson;
  date: Date;
  sameDay: boolean;
  minutesUntil: number;
}

type EditorMode = "new" | "edit";

/* =====================================================================
   KOMPONENTE
   ===================================================================== */

@Component({
  selector: 'app-stundenplan',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {

  /* ---------------- KONFIGURATION – hier trägst du deine echten Daten ein ---------------- */

  // Unterrichtsstunden-Raster. Stunde 9 & 10 sind bereits enthalten –
  // Zeiten bei Bedarf an deine Schule anpassen.
  readonly periods: Period[] = [
    { start: "07:30", end: "08:15" }, // 1
    { start: "08:15", end: "09:00" }, // 2
    { start: "09:15", end: "10:00" }, // 3
    { start: "10:00", end: "10:45" }, // 4
    { start: "11:00", end: "11:45" }, // 5
    { start: "11:45", end: "12:30" }, // 6
    { start: "13:00", end: "13:45" }, // 7
    { start: "13:45", end: "14:30" }, // 8
    { start: "14:45", end: "15:30" }, // 9
    { start: "15:30", end: "16:15" }, // 10
  ];

  // Unterrichtsstunden. Kann jetzt zur Laufzeit über die Buttons in der
  // Oberfläche geändert werden (bearbeiten/hinzufügen/löschen).
  // "track" -> nur für einen Schwerpunkt sichtbar (Informatik / Umwelttechnik)
  // "language" -> nur sichtbar, wenn "Spanisch" gewählt ist
  lessons: Lesson[] = [
    // Montag
    { subject: "Informatik", teacher: "Herr Hansen", room: "B115", day: "Mon", start: "07:30", end: "09:00", track: "Informatik" },
    { subject: "Umweltökonomie", teacher: "Herr Ott", room: "B118", day: "Mon", start: "08:15", end: "09:00", track: "Umwelttechnik" },
    { subject: "Technische Wissenschaft", teacher: "Frau Von Willich", room: "B115", day: "Mon", start: "09:15", end: "10:45", track: "Informatik" },
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
    { subject: "Technische Wissenschaft", teacher: "Frau Von Willich", room: "B115", day: "Tue", start: "11:00", end: "12:30", track: "Informatik" },
    { subject: "Religion", teacher: "Herr Lenz", room: "B208", day: "Tue", start: "13:00", end: "14:30" },
    { subject: "Spanisch", teacher: "WEIT?, CHAP?", room: "A411, A113", day: "Tue", start: "14:45", end: "16:15", language: "Spanisch" },

    // Mittwoch
    { subject: "Physik", teacher: "BORM?", room: "B211", day: "Wed", start: "07:30", end: "09:00", track: "Umwelttechnik" },
    { subject: "Deutsch", teacher: "Her Bendig", room: "B211", day: "Wed", start: "09:15", end: "10:45" },
    { subject: "PoWi", teacher: "Herr van Dyck", room: "B211", day: "Wed", start: "11:00", end: "12:30" },
    { subject: "Englisch", teacher: "Frau Klebsch", room: "B211", day: "Wed", start: "13:00", end: "14:30" },

    // Donnerstag
    { subject: "Mathe", teacher: "Herr von Lindenfels", room: "B211", day: "Thu", start: "07:30", end: "09:00" },
    { subject: "Englisch", teacher: "Frau Klebsch", room: "B211", day: "Thu", start: "09:15", end: "10:45" },
    { subject: "Sport", teacher: "Faru Roos, Herr Sommer", room: "S3", day: "Thu", start: "11:00", end: "12:30" },
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

  private readonly dayDefs: DayDef[] = [
    { key: "Mon", label: "Montag", short: "Mo", jsIdx: 1 },
    { key: "Tue", label: "Dienstag", short: "Di", jsIdx: 2 },
    { key: "Wed", label: "Mittwoch", short: "Mi", jsIdx: 3 },
    { key: "Thu", label: "Donnerstag", short: "Do", jsIdx: 4 },
    { key: "Fri", label: "Freitag", short: "Fr", jsIdx: 5 },
    { key: "Sat", label: "Samstag", short: "Sa", jsIdx: 6 },
    { key: "Sun", label: "Sonntag", short: "So", jsIdx: 0 },
  ];

  readonly subjectPalette: SubjectColor[] = [
    { border: "#6C7CFF", bg: "rgba(108,124,255,0.12)" },
    { border: "#37C9B0", bg: "rgba(55,201,176,0.12)" },
    { border: "#FF7A9E", bg: "rgba(255,122,158,0.12)" },
    { border: "#FFB25A", bg: "rgba(255,178,90,0.12)" },
    { border: "#B084F0", bg: "rgba(176,132,240,0.12)" },
    { border: "#5BB8FF", bg: "rgba(91,184,255,0.12)" },
    { border: "#A8D95C", bg: "rgba(168,217,92,0.12)" },
    { border: "#FF8B66", bg: "rgba(255,139,102,0.12)" },
    { border: "#FF6B6B", bg: "rgba(255,107,107,0.12)" },
    { border: "#F5C84C", bg: "rgba(245,200,76,0.12)" },
    { border: "#6BCB77", bg: "rgba(107,203,119,0.12)" },
    { border: "#4CD9E8", bg: "rgba(76,217,232,0.12)" },
    { border: "#E86AF0", bg: "rgba(232,106,240,0.12)" },
    { border: "#FF9AC1", bg: "rgba(255,154,193,0.12)" },
    { border: "#C9A46A", bg: "rgba(201,164,106,0.12)" },
    { border: "#7C93FF", bg: "rgba(124,147,255,0.12)" },
  ];

  private readonly rangeStart: number = Math.min(...this.periods.map(p => this.toMinutes(p.start))) - 15;
  private readonly rangeEnd: number = Math.max(...this.periods.map(p => this.toMinutes(p.end))) + 15;
  private readonly rangeTotal: number = this.rangeEnd - this.rangeStart;

  /* ---------------- Zustand ---------------- */

  selectedDate: Date = new Date();
  showWeekend: boolean = false;
  isMobile: boolean = false;
  now: Date = new Date();

  gridHeight: number = 760;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private touchStartX: number | null = null;

  /* ---------------- Profil: Schwerpunkt, Naturwissenschaften & Sprache ---------------- */

  private readonly PROFILE_STORAGE_KEY = "stundenplan-profile";

  readonly trackOptions: DayTrack[] = ["Informatik", "Umwelttechnik"];
  readonly scienceOptions: string[] = [...SCIENCE_SUBJECTS];
  readonly languageOptions: LanguageChoice[] = ["Spanisch", "Frei"];
  readonly languageLabels: Record<LanguageChoice, string> = {
    Spanisch: "Spanisch",
    Frei: "Kein Fach / Freistunde",
  };

  selectedTrack: DayTrack = "Informatik";
  selectedSciences: string[] = ["Chemie", "Physik"];
  selectedLanguage: LanguageChoice = "Spanisch";

  private loadProfile(): void {
    try {
      const raw = localStorage.getItem(this.PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.track === "Informatik" || parsed.track === "Umwelttechnik") {
        this.selectedTrack = parsed.track;
      }
      if (Array.isArray(parsed.sciences) && parsed.sciences.length === 2) {
        this.selectedSciences = parsed.sciences.filter((s: string) => SCIENCE_SUBJECTS.includes(s));
      }
      if (parsed.language === "Spanisch" || parsed.language === "Frei") {
        this.selectedLanguage = parsed.language;
      }
    } catch {
      // Ungültige/gelöschte Daten im Speicher ignorieren, Standardwerte behalten.
    }
  }

  private persistProfile(): void {
    try {
      localStorage.setItem(this.PROFILE_STORAGE_KEY, JSON.stringify({
        track: this.selectedTrack,
        sciences: this.selectedSciences,
        language: this.selectedLanguage,
      }));
    } catch {
      // z.B. Privater Modus ohne Speicherzugriff – dann bleibt die Auswahl nur für diese Sitzung erhalten.
    }
  }

  /* ---------------- Fach-Farben (manuell überschreibbar, pro Fachname gespeichert) ---------------- */

  private readonly SUBJECT_COLOR_STORAGE_KEY = "stundenplan-subject-colors";

  // Fachname -> Index in subjectPalette. Fächer ohne Eintrag bekommen weiterhin
  // automatisch eine Farbe anhand ihres Namens zugewiesen.
  private subjectColorOverrides: Record<string, number> = {};

  private loadSubjectColors(): void {
    try {
      const raw = localStorage.getItem(this.SUBJECT_COLOR_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.subjectColorOverrides = parsed;
      }
    } catch {
      // Ungültige/gelöschte Daten im Speicher ignorieren.
    }
  }

  private persistSubjectColors(): void {
    try {
      localStorage.setItem(this.SUBJECT_COLOR_STORAGE_KEY, JSON.stringify(this.subjectColorOverrides));
    } catch {
      // z.B. Privater Modus ohne Speicherzugriff.
    }
  }

  setTrack(track: DayTrack): void {
    this.selectedTrack = track;
    this.persistProfile();
  }

  setLanguage(language: LanguageChoice): void {
    this.selectedLanguage = language;
    this.persistProfile();
  }

  toggleLanguage(): void {
    this.selectedLanguage = this.selectedLanguage === "Spanisch" ? "Frei" : "Spanisch";
    this.persistProfile();
  }

  toggleScience(subject: string): void {
    const idx = this.selectedSciences.indexOf(subject);
    if (idx !== -1) {
      this.selectedSciences.splice(idx, 1);
    } else if (this.selectedSciences.length < 2) {
      this.selectedSciences.push(subject);
    }
    this.persistProfile();
  }

  isScienceDisabled(subject: string): boolean {
    return this.selectedSciences.length >= 2 && !this.selectedSciences.includes(subject);
  }

  private isLessonVisible(l: Lesson): boolean {
    if (l.track && l.track !== this.selectedTrack) return false;
    const scienceKey = l.scienceGroup || l.subject;
    if (SCIENCE_SUBJECTS.includes(scienceKey) && !this.selectedSciences.includes(scienceKey)) return false;
    if (l.language && l.language !== this.selectedLanguage) return false;
    return true;
  }

  /* ---------------- Editor-Zustand (Fach hinzufügen/bearbeiten) ---------------- */

  editorOpen: boolean = false;
  editorMode: EditorMode = "new";
  editorIndex: number | null = null;

  editorDay: DayKey = "Mon";
  editorStart: string = this.periods[0].start;
  editorEnd: string = this.periods[0].end;
  editorSubject: string = "";
  editorTeacher: string = "";
  editorRoom: string = "";
  editorTrack: DayTrack | "" = "";       // "" = für beide Schwerpunkte sichtbar
  editorLanguage: "Spanisch" | "" = "";  // "" = unabhängig von der Sprachwahl sichtbar
  editorScienceGroup: "Chemie" | "Physik" | "Biologie" | "" = ""; // nur bei abweichendem Fachnamen nötig
  editorColorIndex: number | null = null; // null = automatische Farbe anhand des Fachnamens

  setEditorColor(idx: number | null): void {
    this.editorColorIndex = idx;
  }

  ngOnInit(): void {
    this.loadProfile();
    this.loadSubjectColors();
    this.isMobile = window.matchMedia("(max-width:920px)").matches;
    this.updateGridHeight();
    this.timerId = setInterval(() => {
      this.now = new Date();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerId) clearInterval(this.timerId);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile = window.matchMedia("(max-width:920px)").matches;
    this.updateGridHeight();
  }

  private updateGridHeight(): void {
    this.gridHeight = this.isMobile ? Math.max(560, window.innerHeight * 0.62) : 760;
  }

  /* ---------------- Hilfsfunktionen ---------------- */

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  private fmtMinutes(min: number): string {
    const h = Math.floor(min / 60), m = min % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  private fmtHM(d: Date): string {
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  private pctFromMinutes(min: number): number {
    return Math.min(100, Math.max(0, ((min - this.rangeStart) / this.rangeTotal) * 100));
  }

  private subjectColor(name: string): SubjectColor {
    const overrideIdx = this.subjectColorOverrides[name];
    if (overrideIdx !== undefined && this.subjectPalette[overrideIdx]) {
      return this.subjectPalette[overrideIdx];
    }
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return this.subjectPalette[h % this.subjectPalette.length];
  }

  private dayKeyFromDate(date: Date): DayKey | null {
    const def = this.dayDefs.find(d => d.jsIdx === date.getDay());
    return def ? def.key : null;
  }

  private startOfWeek(date: Date): Date {
    const d = new Date(date);
    const jsDay = d.getDay();
    const diffToMonday = (jsDay === 0 ? -6 : 1 - jsDay);
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private isSameDate(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  private lessonsForDay(dayKey: DayKey): Lesson[] {
    return this.lessons
      .filter(l => l.day === dayKey)
      .filter(l => this.isLessonVisible(l))
      .sort((a, b) => this.toMinutes(a.start) - this.toMinutes(b.start));
  }

  // Alle Uhrzeiten aus dem Perioden-Raster, aufsteigend sortiert, ohne Duplikate.
  // Wird für die Start-/Ende-Auswahl im Editor benutzt.
  get periodTimes(): string[] {
    const times = new Set<number>();
    this.periods.forEach(p => { times.add(this.toMinutes(p.start)); times.add(this.toMinutes(p.end)); });
    return Array.from(times).sort((a, b) => a - b).map(min => this.fmtMinutes(min));
  }

  get dayOptions(): DayDef[] {
    return this.dayDefs;
  }

  /* ---------------- Template-Getter: Uhr & Status ---------------- */

  get clockHours(): string {
    return String(this.now.getHours()).padStart(2, "0");
  }

  get clockMinutes(): string {
    return String(this.now.getMinutes()).padStart(2, "0");
  }

  get clockDateLabel(): string {
    return this.now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  }

  private get todayKey(): DayKey | null {
    return this.dayKeyFromDate(this.now);
  }

  private get liveLesson(): Lesson | null {
    const dayKey = this.todayKey;
    if (!dayKey) return null;
    const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
    return this.lessonsForDay(dayKey).find(l => nowMin >= this.toMinutes(l.start) && nowMin < this.toMinutes(l.end)) || null;
  }

  get isLive(): boolean {
    return !!this.liveLesson;
  }

  get statusText(): string {
    const dayKey = this.todayKey;
    const live = this.liveLesson;

    if (!dayKey) return "Kein Schultag";
    if (live) return live.subject + " läuft";

    const todays = this.lessonsForDay(dayKey);
    const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
    const firstToday = todays[0];

    if (firstToday && nowMin < this.toMinutes(firstToday.start)) {
      return "Schule beginnt in " + (this.toMinutes(firstToday.start) - nowMin) + " Min.";
    }
    const upcomingToday = todays.find(l => this.toMinutes(l.start) > nowMin);
    if (upcomingToday) return "Keine aktuelle Unterrichtsstunde";
    if (todays.length) return "Schultag beendet";
    return "Keine aktuelle Unterrichtsstunde";
  }

  get statusDetail(): string {
    const dayKey = this.todayKey;
    const live = this.liveLesson;

    if (!dayKey) return "Heute findet kein Unterricht statt.";
    if (live) {
      const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
      return `noch ${Math.max(1, this.toMinutes(live.end) - nowMin)} Min. · Raum ${live.room}`;
    }

    const todays = this.lessonsForDay(dayKey);
    const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
    const firstToday = todays[0];

    if (firstToday && nowMin < this.toMinutes(firstToday.start)) {
      return firstToday.subject + " um " + firstToday.start + " Uhr";
    }
    const upcomingToday = todays.find(l => this.toMinutes(l.start) > nowMin);
    if (upcomingToday) return "Pause · als Nächstes " + upcomingToday.subject + " um " + upcomingToday.start;
    if (todays.length) return "Letzte Stunde: " + todays[todays.length - 1].subject;
    return "Du hast heute kein Unterricht";
  }

  /* ---------------- Template-Getter: Tage & Raster ---------------- */

  private get visibleDayDefs(): DayDef[] {
    return this.showWeekend ? this.dayDefs : this.dayDefs.slice(0, 5);
  }

  get mobileDayDef(): DayDef {
    return this.dayDefs.find(d => d.key === this.dayKeyFromDate(this.selectedDate)) || this.dayDefs[0];
  }

  get mobileDayDate(): Date {
    return this.selectedDate;
  }

  get displayedDays(): DayColumn[] {
    const entries: { def: DayDef; date: Date }[] = this.isMobile
      ? [{ def: this.mobileDayDef, date: this.selectedDate }]
      : this.weekDates(this.selectedDate);

    return entries.map(({ def, date }) => this.buildDayColumn(def, date));
  }

  private weekDates(anchorDate: Date): { def: DayDef; date: Date }[] {
    const monday = this.startOfWeek(anchorDate);
    return this.visibleDayDefs.map(def => {
      const offset = def.jsIdx === 0 ? 6 : def.jsIdx - 1; // So am Ende der Woche
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      return { def, date: d };
    });
  }

  private buildDayColumn(def: DayDef, date: Date): DayColumn {
    const isToday = this.isSameDate(date, this.now);
    const live = this.liveLesson;
    const todayKey = this.todayKey;

    const lessons: PositionedLesson[] = this.lessonsForDay(def.key).map(l => {
      const top = this.pctFromMinutes(this.toMinutes(l.start));
      const bottom = this.pctFromMinutes(this.toMinutes(l.end));
      const isLive = !!live && def.key === todayKey && l.start === live.start;
      return {
        ...l,
        top,
        height: Math.max(bottom - top, 4),
        isLive,
        color: this.subjectColor(l.subject),
        sourceIndex: this.lessons.indexOf(l),
      };
    });

    return { def, date, isToday, lessons };
  }

  get timeMarks(): TimeMark[] {
    const times = new Set<number>();
    this.periods.forEach(p => { times.add(this.toMinutes(p.start)); times.add(this.toMinutes(p.end)); });
    return Array.from(times).sort((a, b) => a - b).map(min => ({
      minutes: min,
      label: this.fmtMinutes(min),
      top: this.pctFromMinutes(min),
    }));
  }

  /* ---------------- Template-Getter: Sweep-Line ---------------- */

  get sweepVisible(): boolean {
    const dayKey = this.todayKey;
    const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
    const hasTodayColumn = this.displayedDays.some(c => c.def.key === dayKey);
    return !!dayKey && hasTodayColumn && nowMin >= this.rangeStart && nowMin <= this.rangeEnd;
  }

  get sweepTop(): number {
    const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
    return this.pctFromMinutes(nowMin);
  }

  get sweepLabel(): string {
    return this.fmtHM(this.now);
  }

  /* ---------------- Template-Getter: Nächste Stunde ---------------- */

  get nextLessonInfo(): NextLessonInfo | null {
    const now = this.now;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todayKey = this.todayKey;

    if (todayKey) {
      const today = this.lessonsForDay(todayKey).find(l => this.toMinutes(l.start) > nowMin);
      if (today) {
        return {
          lesson: today,
          date: now,
          sameDay: true,
          minutesUntil: this.minutesUntil(now, now, today.start),
        };
      }
    }

    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const key = this.dayKeyFromDate(d);
      if (!key) continue;
      const list = this.lessonsForDay(key);
      if (list.length) {
        return { lesson: list[0], date: d, sameDay: false, minutesUntil: 0 };
      }
    }
    return null;
  }

  get nextLessonWhenLabel(): string {
    const next = this.nextLessonInfo;
    if (!next) return "";
    if (next.sameDay) {
      return next.minutesUntil <= 0 ? "jetzt" : `in ${next.minutesUntil} Min.`;
    }
    return next.date.toLocaleDateString("de-DE", { weekday: "long" });
  }

  get nextLessonDateSuffix(): string {
    const next = this.nextLessonInfo;
    if (!next || next.sameDay) return "";
    return " · " + next.date.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
  }

  private minutesUntil(now: Date, targetDate: Date, targetHHMM: string): number {
    const [h, m] = targetHHMM.split(":").map(Number);
    const t = new Date(targetDate);
    t.setHours(h, m, 0, 0);
    return Math.round((t.getTime() - now.getTime()) / 60000);
  }

  /* ---------------- Navigation ---------------- */

  private shiftDay(delta: number): void {
    const d = new Date(this.selectedDate);
    do {
      d.setDate(d.getDate() + delta);
    } while (!this.showWeekend && (d.getDay() === 0 || d.getDay() === 6));
    this.selectedDate = d;
  }

  private shiftWeek(delta: number): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + delta * 7);
    this.selectedDate = d;
  }

  goPrev(): void {
    this.shiftWeek(-1);
  }

  goNext(): void {
    this.shiftWeek(1);
  }

  toggleWeekend(): void {
    this.showWeekend = !this.showWeekend;
  }

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.touches[0].clientX;
  }

  onTouchEnd(e: TouchEvent): void {
    if (this.touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    if (Math.abs(dx) > 55) this.shiftDay(dx < 0 ? 1 : -1);
    this.touchStartX = null;
  }

  /* ---------------- Editor: Fach hinzufügen / bearbeiten / löschen ---------------- */

  openNewLesson(): void {
    this.editorMode = "new";
    this.editorIndex = null;
    this.editorDay = this.mobileDayDef ? this.mobileDayDef.key : "Mon";
    this.editorStart = this.periods[0].start;
    this.editorEnd = this.periods[0].end;
    this.editorSubject = "";
    this.editorTeacher = "";
    this.editorRoom = "";
    this.editorTrack = "";
    this.editorLanguage = "";
    this.editorScienceGroup = "";
    this.editorColorIndex = null;
    this.editorOpen = true;
  }

  openEditLesson(lesson: PositionedLesson, event?: Event): void {
    if (event) event.stopPropagation();
    const idx = lesson.sourceIndex;
    const target = this.lessons[idx];
    if (!target) return;

    this.editorMode = "edit";
    this.editorIndex = idx;
    this.editorDay = target.day;
    this.editorStart = target.start;
    this.editorEnd = target.end;
    this.editorSubject = target.subject;
    this.editorTeacher = target.teacher;
    this.editorRoom = target.room;
    this.editorTrack = target.track || "";
    this.editorLanguage = target.language || "";
    this.editorScienceGroup = target.scienceGroup || "";
    this.editorColorIndex = this.subjectColorOverrides[target.subject] ?? null;
    this.editorOpen = true;
  }

  closeEditor(): void {
    this.editorOpen = false;
    this.editorIndex = null;
  }

  saveLesson(): void {
    if (!this.editorSubject.trim()) return; // Fach ist Pflichtfeld

    const newLesson: Lesson = {
      subject: this.editorSubject.trim(),
      teacher: this.editorTeacher.trim(),
      room: this.editorRoom.trim(),
      day: this.editorDay,
      start: this.editorStart,
      end: this.editorEnd,
      ...(this.editorTrack ? { track: this.editorTrack } : {}),
      ...(this.editorLanguage ? { language: this.editorLanguage } : {}),
      ...(this.editorScienceGroup ? { scienceGroup: this.editorScienceGroup } : {}),
    };

    if (this.editorMode === "edit" && this.editorIndex !== null) {
      this.lessons.splice(this.editorIndex, 1, newLesson);
    } else {
      this.lessons.push(newLesson);
    }

    if (this.editorColorIndex !== null) {
      this.subjectColorOverrides[newLesson.subject] = this.editorColorIndex;
    } else {
      delete this.subjectColorOverrides[newLesson.subject];
    }
    this.persistSubjectColors();

    this.closeEditor();
  }

  deleteLesson(): void {
    if (this.editorIndex !== null) {
      this.lessons.splice(this.editorIndex, 1);
    }
    this.closeEditor();
  }
}