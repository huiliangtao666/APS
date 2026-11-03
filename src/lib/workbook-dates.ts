/** Workbook APIs store calendar days as offsets from this fixed simulation origin. */
export const WORKBOOK_DAY_ZERO='2026-10-31';
const dayMs=86_400_000;

export function workbookDate(day:unknown,origin=WORKBOOK_DAY_ZERO):string {
  if(day===null||day===undefined||day==='')return '';
  const offset=Number(day),base=Date.parse(`${origin}T00:00:00Z`);
  if(!Number.isFinite(offset)||!Number.isFinite(base))return '';
  const value=new Date(base+offset*dayMs);
  return Number.isFinite(value.getTime())?value.toISOString().slice(0,10):'';
}

export function workbookDay(date:string,origin=WORKBOOK_DAY_ZERO):number|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const value=Date.parse(`${date}T00:00:00Z`),base=Date.parse(`${origin}T00:00:00Z`);
  if(!Number.isFinite(value)||!Number.isFinite(base)||new Date(value).toISOString().slice(0,10)!==date)return null;
  return (value-base)/dayMs;
}

export function workbookDateTime(day:unknown,origin=WORKBOOK_DAY_ZERO):string {
  if(day===null||day===undefined||day==='')return '';
  const offset=Number(day),base=Date.parse(`${origin}T00:00:00Z`);
  if(!Number.isFinite(offset)||!Number.isFinite(base))return '';
  const value=new Date(base+offset*dayMs);
  if(!Number.isFinite(value.getTime()))return '';
  const iso=value.toISOString();
  return iso.slice(0,10)+(iso.slice(11,16)==='00:00'?'':' '+iso.slice(11,16));
}
