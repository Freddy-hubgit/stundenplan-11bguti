import {Period} from './timetable-data';
// Shared by the timetable, bookings, exams, substitutions and absence requests.
export const SCHOOL_PERIODS:ReadonlyArray<Period>=[
 {start:'07:30',end:'08:15'},{start:'08:15',end:'09:00'},
 {start:'09:15',end:'10:00'},{start:'10:00',end:'10:45'},
 {start:'11:00',end:'11:45'},{start:'11:45',end:'12:30'},
 {start:'13:00',end:'13:45'},{start:'13:45',end:'14:30'},
 {start:'14:45',end:'15:30'},{start:'15:30',end:'16:15'}
];
export function periodRangeLabel(start:string,end:string):string{
 const first=SCHOOL_PERIODS.findIndex(p=>p.start===start.slice(0,5)),last=SCHOOL_PERIODS.findIndex(p=>p.end===end.slice(0,5));
 return first<0||last<first?'':first===last?`${first+1}. Stunde`:`${first+1}.–${last+1}. Stunde`;
}
