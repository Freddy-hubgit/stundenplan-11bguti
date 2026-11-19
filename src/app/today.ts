// Calendar dates use the school's time zone, including around midnight and DST.
const schoolDayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
export function schoolDateKey(value:Date):string{return Number.isNaN(value.getTime())?'':schoolDayFormatter.format(value);}
export function todayKey():string{return schoolDateKey(new Date());}
