import { BackgroundImageService } from './background-image.service';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SubjectColor {
  border: string;
  bg: string;
}

export interface Settings {
  theme: 'dark' | 'light';
  background: string;
  subjectColorOverrides: Record<string, number>;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly APPEARANCE_STORAGE_KEY = 'stundenplan-appearance';
  private readonly SUBJECT_COLOR_STORAGE_KEY = 'stundenplan-subject-colors';

  private themeSubject = new BehaviorSubject<'dark' | 'light'>('dark');
  private backgroundKeySubject = new BehaviorSubject<string>('default');
  private subjectColorOverridesSubject = new BehaviorSubject<Record<string, number>>({});

  theme$ = this.themeSubject.asObservable();
  backgroundKey$ = this.backgroundKeySubject.asObservable();
  subjectColorOverrides$ = this.subjectColorOverridesSubject.asObservable();

  get theme(): 'dark' | 'light' {
    return this.themeSubject.value;
  }

  get backgroundKey(): string {
    return this.backgroundKeySubject.value;
  }

  get subjectColorOverrides(): Record<string, number> {
    return this.subjectColorOverridesSubject.value;
  }

  constructor(public backgroundImage: BackgroundImageService) {
    this.loadAppearance();
    this.loadSubjectColors();
  }

  /* ==================== Appearance (Theme & Background) ==================== */

  private loadAppearance(): void {
    try {
      const raw = localStorage.getItem(this.APPEARANCE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.theme === 'dark' || parsed.theme === 'light') {
        this.themeSubject.next(parsed.theme);
      }
      if (typeof parsed.background === 'string') {
        this.backgroundKeySubject.next(parsed.background);
      }
    } catch {
      // Ungültige/gelöschte Daten im Speicher ignorieren.
    }
  }

  private persistAppearance(): void {
    try {
      localStorage.setItem(
        this.APPEARANCE_STORAGE_KEY,
        JSON.stringify({ theme: this.themeSubject.value, background: this.backgroundKeySubject.value })
      );
    } catch {
      // z.B. Privater Modus ohne Speicherzugriff.
    }
  }

  setTheme(t: 'dark' | 'light'): void {
    this.themeSubject.next(t);
    this.persistAppearance();
  }

  async setBackground(key: string): Promise<void> {
    if (this.backgroundImage.busy) return;
    if (this.backgroundImage.url && !(await this.backgroundImage.remove())) return;
    this.backgroundKeySubject.next(key);
    this.persistAppearance();
  }

  /* ==================== Subject Colors ==================== */

  private loadSubjectColors(): void {
    try {
      const raw = localStorage.getItem(this.SUBJECT_COLOR_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.subjectColorOverridesSubject.next(parsed);
      }
    } catch {
      // Ungültige/gelöschte Daten im Speicher ignorieren.
    }
  }

  private persistSubjectColors(): void {
    try {
      localStorage.setItem(
        this.SUBJECT_COLOR_STORAGE_KEY,
        JSON.stringify(this.subjectColorOverridesSubject.value)
      );
    } catch {
      // z.B. Privater Modus ohne Speicherzugriff.
    }
  }

  subjectColorIndex(subject: string): number | null {
    return this.subjectColorOverrides[subject] ?? null;
  }

  setSubjectColor(subject: string, idx: number | null): void {
    const current = { ...this.subjectColorOverridesSubject.value };
    if (idx !== null) {
      current[subject] = idx;
    } else {
      delete current[subject];
    }
    this.subjectColorOverridesSubject.next(current);
    this.persistSubjectColors();
  }

  renameSubjectColor(oldName: string, newName: string): void {
    const current = { ...this.subjectColorOverridesSubject.value };
    if (current[oldName] !== undefined) {
      current[newName] = current[oldName];
      delete current[oldName];
      this.subjectColorOverridesSubject.next(current);
      this.persistSubjectColors();
    }
  }

  /* ==================== Export/Import ==================== */

  getSubjectColorOverrides(): Record<string, number> {
    return { ...this.subjectColorOverridesSubject.value };
  }

  setSubjectColorOverrides(overrides: Record<string, number>): void {
    this.subjectColorOverridesSubject.next({ ...overrides });
    this.persistSubjectColors();
  }
}
