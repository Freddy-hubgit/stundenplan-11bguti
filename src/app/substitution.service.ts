import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Lesson } from './timetable-data';

export interface Substitution {
  id: string; date: string; teacher: string; start_time: string; end_time: string;
  kind: 'replacement' | 'cancelled'; replacement_teacher: string; room: string; note: string;
  updated_at: string;
}
export type SubstitutionInput = Omit<Substitution, 'id' | 'updated_at'>;
export type EffectiveLesson = Lesson & { substitution?: Substitution; originalTeacher?: string; originalRoom?: string };
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function applySubstitution(lesson: Lesson, date: string, entries: Substitution[]): EffectiveLesson {
  const entry = entries.find(e => e.date === date && e.teacher.trim().toLowerCase() === lesson.teacher.trim().toLowerCase()
    && e.start_time.slice(0, 5) < lesson.end && e.end_time.slice(0, 5) > lesson.start);
  if (!entry) return lesson;
  return { ...lesson, substitution: entry, originalTeacher: lesson.teacher, originalRoom: lesson.room,
    cancelled: entry.kind === 'cancelled',
    teacher: entry.kind === 'replacement' ? entry.replacement_teacher : lesson.teacher,
    room: entry.room || lesson.room };
}
// Split partial-day changes at their actual boundaries; other portions remain regular lessons.
export function splitSubstitutions(lesson: Lesson, date: string, entries: Substitution[]): EffectiveLesson[] {
  const matching = entries.filter(e => e.date === date && e.teacher.trim().toLowerCase() === lesson.teacher.trim().toLowerCase()
    && e.start_time.slice(0, 5) < lesson.end && e.end_time.slice(0, 5) > lesson.start);
  if (!matching.length) return [lesson];
  const boundaries = new Set([lesson.start, lesson.end]);
  matching.forEach(e => {
    boundaries.add(e.start_time.slice(0,5) < lesson.start ? lesson.start : e.start_time.slice(0,5));
    boundaries.add(e.end_time.slice(0,5) > lesson.end ? lesson.end : e.end_time.slice(0,5));
  });
  const times = Array.from(boundaries).sort();
  return times.slice(0, -1).map((start, i) => applySubstitution({ ...lesson, start, end: times[i+1] }, date, matching));
}
@Injectable({ providedIn: 'root' })
export class SubstitutionService {
  constructor(private api: SupabaseService) {}
  list(): Promise<Substitution[]> { return this.api.supportRpc('substitution_list'); }
  save(entry: SubstitutionInput, id: string | null, endDate: string = entry.date): Promise<string | string[]> {
    const range = !id && endDate !== entry.date;
    return this.api.supportRpc(range ? 'substitution_save_range' : 'substitution_save', {
      ...(range ? { end_date: endDate } : { entry_id: id }), entry_date: entry.date,
      absent_teacher: entry.teacher, starts: entry.start_time, ends: entry.end_time,
      entry_kind: entry.kind, replacement: entry.replacement_teacher, new_room: entry.room, info: entry.note });
  }
  remove(id: string): Promise<void> { return this.api.supportRpc('substitution_delete', { entry_id: id }); }
}
