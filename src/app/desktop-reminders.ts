export function berlinReminderClock(now:Date):{day:string;tomorrow:string;time:string}{
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 return {day,tomorrow:next.toISOString().slice(0,10),time:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)};
}
export function pendingNativeHomework(tasks:any[],tomorrow:string,student:boolean):number{return tasks.filter(t=>t.due_date===tomorrow&&(!t.is_shared||student)&&(!t.done||(t.requires_submission&&!t.submitted))).length;}
export function nativeNotificationIds(rows:any[]):string[]{return Array.from(new Set(rows.map(row=>String(row.id||'')).filter(Boolean)));}
export function freshNativeNotifications(rows:any[],seen:string[]):any[]{const ids=new Set(seen);return rows.filter(row=>!row.read_at&&!ids.has(String(row.id)));}
