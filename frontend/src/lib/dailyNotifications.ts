// dailyNotifications.ts — the 8am card, scheduled entirely on the device.
//
// No push service, no FCM token, no server. Android's LocalNotifications holds
// a queue of pending notifications and fires them itself; we fill that queue
// with a run of days precomputed by dailyOracle.ts. Nothing about the reader's
// chart leaves the phone to make this work, which is the only version of this
// feature that fits what the app already promises.
//
// The consequence to keep in mind: **our code does not run when a notification
// fires.** Whatever the queue holds is what the reader sees, so the queue is
// topped up on every launch and the content must be correct at SCHEDULE time,
// not at fire time. That is exactly why the daily draw being a pure function
// of (chart, date) matters — see dailyOracle.ts.
import { LocalNotifications } from "@capacitor/local-notifications";
import type { ChartResponse } from "@astra/core";
import { precomputeDailyDraws, localDateKey, type DailyDraw } from "./dailyOracle";

const PREF_KEY = "aae.daily_notifications";

/** Our notification ids live in a reserved band so `cancel` only ever touches
 *  ours. Android ids are 32-bit ints; the day offset is added to the base, so
 *  the band is [BASE, BASE + HORIZON). */
const ID_BASE = 710_000;

/** How many days are queued at once. See precomputeDailyDraws for why 60. */
const HORIZON = 60;

export interface DailyNotificationPrefs {
  enabled: boolean;
  hour: number; // 0–23, local
  minute: number; // 0–59
}

export const DEFAULT_PREFS: DailyNotificationPrefs = {
  enabled: false, // opt-in: nothing is scheduled until the reader asks
  hour: 8,
  minute: 0,
};

/** One scheduled notification, in the shape the plugin takes. Kept as our own
 *  type so `planDailyNotifications` stays pure and testable without a device
 *  or the plugin present. */
export interface PlannedNotification {
  id: number;
  title: string;
  body: string;
  /** Local wall-clock instant this should fire. */
  at: Date;
  extra: { date: string; cardId: string };
}

/** Clamp a stored preference back into a real time-of-day.
 *
 *  Preferences come out of localStorage, which is user-writable and survives
 *  version changes; an hour of 25 or a NaN minute would be accepted silently by
 *  the Date constructor and schedule the notification on some other day. */
export function normalisePrefs(raw: Partial<DailyNotificationPrefs> | null): DailyNotificationPrefs {
  const int = (v: unknown, fallback: number, max: number): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
  };
  return {
    enabled: raw?.enabled === true,
    hour: int(raw?.hour, DEFAULT_PREFS.hour, 23),
    minute: int(raw?.minute, DEFAULT_PREFS.minute, 59),
  };
}

export function readPrefs(): DailyNotificationPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return normalisePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    // Corrupt JSON or storage denied: the answer is "off", never a guess that
    // starts sending notifications nobody asked for.
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(p: DailyNotificationPrefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(normalisePrefs(p)));
  } catch {
    /* storage denied — the schedule still applies for this session */
  }
}

/** Turn a run of draws into the notifications to schedule.
 *
 *  Pure, so the interesting behaviour is testable without a phone. Two rules
 *  it enforces:
 *
 *  1. **A time already past today is not scheduled.** Enabling the feature at
 *     10am with an 8am preference must not fire today's card immediately —
 *     Android delivers a past-dated local notification the moment it is
 *     scheduled, which would feel like a bug and would show a card the reader
 *     may already have seen.
 *  2. **The id encodes the day offset**, so re-planning overwrites the same
 *     slots rather than accumulating duplicates.
 */
export function planDailyNotifications(
  draws: DailyDraw[],
  prefs: DailyNotificationPrefs,
  now: Date = new Date()
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (let i = 0; i < draws.length; i++) {
    const d = draws[i];
    const [y, m, day] = d.date.split("-").map(Number);
    const at = new Date(y, m - 1, day, prefs.hour, prefs.minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue; // rule 1
    out.push({
      id: ID_BASE + i,
      title: `Today's card — ${d.title}`,
      body: d.line,
      at,
      extra: { date: d.date, cardId: d.cardId },
    });
  }
  return out;
}

/** True when local notifications can actually be scheduled — i.e. we are the
 *  Android app, not a browser tab. The plugin's web implementation exists but
 *  depends on the page being open, which is precisely the case a daily card
 *  notification is for, so we do not offer it there. */
export async function isSupported(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Ask once. Android 13+ requires an explicit grant; a refusal is final until
 *  the reader changes it in system settings, and is reported honestly rather
 *  than retried on every launch. */
export async function ensurePermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  if (current.display === "denied") return false;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === "granted";
}

/** Clear only our band. */
export async function cancelDaily(): Promise<void> {
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications
    .filter((n) => n.id >= ID_BASE && n.id < ID_BASE + HORIZON)
    .map((n) => ({ id: n.id }));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours });
}

/**
 * Re-fill the queue from today. Safe to call on every launch — it cancels our
 * band first, so repeated calls converge rather than accumulate.
 *
 * Returns the number scheduled, or -1 if permission was refused.
 */
export async function rescheduleDaily(
  chart: ChartResponse,
  prefs: DailyNotificationPrefs = readPrefs()
): Promise<number> {
  if (!(await isSupported())) return 0;
  await cancelDaily();
  if (!prefs.enabled) return 0;
  if (!(await ensurePermission())) return -1;

  const draws = precomputeDailyDraws(chart, HORIZON);
  const planned = planDailyNotifications(draws, prefs);
  if (!planned.length) return 0;

  await LocalNotifications.schedule({
    notifications: planned.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      // Android tints this to a white silhouette; without it Capacitor uses
      // its own generic default, which is what the first device test found
      // sitting in the shade next to a reading. See ic_stat_astra.xml.
      smallIcon: "ic_stat_astra",
      schedule: { at: p.at, allowWhileIdle: true },
      extra: p.extra,
    })),
  });
  return planned.length;
}

/** The draw the reader should be looking at right now. */
export function todaysDraw(chart: ChartResponse): DailyDraw {
  return precomputeDailyDraws(chart, 1)[0];
}

export { localDateKey };
