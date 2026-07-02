// lib/datetime.ts — local-time helpers for <input type="datetime-local">.
//
// `Date.toISOString()` renders UTC ("2026-07-02T23:07:00.000Z"), which is
// both the wrong wall-clock time for non-UTC users and an invalid value for
// datetime-local inputs (the trailing seconds/ms/Z blank the field). Always
// go through this formatter when writing to `transitIso`.

/** Format a date as the browser-local "YYYY-MM-DDTHH:mm" datetime-local value. */
export function toDatetimeLocal(input: Date | number | string): string {
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return toDatetimeLocal(new Date());
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
