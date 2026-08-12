// dailySync.ts — the one call that keeps the off-app surfaces current.
//
// Both the 8am notification and the home-screen widget answer while our code
// is not running, from data this app left behind. That data has exactly one
// refresh opportunity: a launch. So a launch has to top up both, and it has to
// do so without ever being the reason a launch fails.
//
// Hence: never throws, never blocks the first paint, and treats every
// individual failure as "the surface keeps what it had", which is always a
// better outcome than a broken start.
import type { ChartResponse } from "@astra/core";
import { rescheduleDaily } from "./dailyNotifications";
import { publishWidgetData } from "./widgetBridge";

export interface DailySyncResult {
  /** Notifications scheduled; 0 if off or unsupported, -1 if permission refused. */
  scheduled: number;
  caption: boolean;
  wheel: boolean;
}

/**
 * Refresh the notification queue and the widget's data from `chart`.
 *
 * Safe to call on every launch and on every chart change — `rescheduleDaily`
 * cancels our own notification band before refilling it, so repeated calls
 * converge rather than accumulate.
 */
export async function syncDailySurfaces(chart: ChartResponse): Promise<DailySyncResult> {
  const out: DailySyncResult = { scheduled: 0, caption: false, wheel: false };

  // Sequential, not Promise.all: both touch native bridges during launch, and
  // the widget's rasterise pass walks the whole live SVG with getComputedStyle.
  // Doing that beside the scheduler just makes the busiest moment busier for
  // no gain — nothing is waiting on either result.
  try {
    out.scheduled = await rescheduleDaily(chart);
  } catch {
    /* the existing queue stands */
  }

  try {
    const published = await publishWidgetData(chart);
    out.caption = published.caption;
    out.wheel = published.wheel;
  } catch {
    /* the widget keeps its previous face */
  }

  return out;
}
