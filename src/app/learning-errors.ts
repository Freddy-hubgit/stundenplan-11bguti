export function learningError(error:any,fallback:string):string{
 return ['PGRST202','42883','42P01','42703'].includes(error?.code)
  ? 'Dieser Bereich ist noch nicht eingerichtet. Bitte einen Admin um die Supabase-Einrichtung bitten.'
  : error?.message||fallback;
}
