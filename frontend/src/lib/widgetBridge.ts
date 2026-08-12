// widgetBridge.ts — handing the home-screen widget something it can draw.
//
// An Android app widget renders through RemoteViews: TextView, ImageView, and
// a few layouts. No WebView, no SVG, no React. So the wheel cannot be "shown"
// on a home screen — it has to arrive as a BITMAP, and the only place a bitmap
// of our wheel can come from is this app, while it is running.
//
// That is the same bargain the daily card already makes (see dailyOracle.ts):
// compute while we have the engine, leave the answer somewhere dumb, and let
// the surface that cannot compute simply read it. Here the answer is a PNG in
// app-internal storage plus a caption in SharedPreferences, and the widget
// provider — which runs in OUR process, so it can read both — decodes and
// draws them.
//
// The alternative was drawing the wheel again in Kotlin. That is a second
// renderer for the app's signature image, with no test that the two agree, and
// it would drift the way every unwitnessed second implementation in this
// repository has drifted.
import { Preferences } from "@capacitor/preferences";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { ChartResponse } from "@astra/core";
import { dailyDrawFor, localDateKey } from "./dailyOracle";

/** Where the provider looks. Kept in one place because the Kotlin side hard-codes
 *  the same strings — see DailyWheelWidget.kt. */
export const WIDGET_KEYS = {
  caption: "aae.widget.caption",
  title: "aae.widget.title",
  date: "aae.widget.date",
  wheelFile: "aae.widget.wheel_file",
} as const;

/** Relative to Directory.Data, which is /data/data/<pkg>/files. */
const WHEEL_FILENAME = "widget-wheel.png";

/** Bitmap edge in px.
 *
 *  Bounded by Binder, not by taste: the provider hands the launcher a decoded
 *  Bitmap through `setImageViewBitmap`, and a RemoteViews transaction over
 *  ~1 MB throws TransactionTooLargeException and the widget shows as blank.
 *  400×400 at ARGB_8888 is 640 KB, which leaves room for the rest of the
 *  RemoteViews. Raising this is how the widget silently stops appearing. */
const WHEEL_PX = 400;

/** Properties that must be inlined for the SVG to survive rasterisation.
 *  `getComputedStyle` resolves CSS custom properties, which is the whole point:
 *  the wheel is themed through var(--gold) and friends, and a serialized SVG
 *  carries none of the stylesheet that defines them. Without this pass the PNG
 *  comes out as black-on-transparent shapes. */
const INLINE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
] as const;

function inlineComputedStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
  const from = [source, ...Array.from(source.querySelectorAll("*"))];
  const to = [clone, ...Array.from(clone.querySelectorAll("*"))];
  for (let i = 0; i < from.length && i < to.length; i++) {
    const computed = window.getComputedStyle(from[i] as Element);
    const target = to[i] as SVGElement;
    for (const prop of INLINE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "none" && value !== "normal") {
        target.style.setProperty(prop, value);
      }
    }
  }
}

/** The app's page ground, so the PNG is not transparent on a pale launcher. */
function pageBackground(): string {
  const bg = window
    .getComputedStyle(document.body)
    .getPropertyValue("background-color")
    .trim();
  return bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#0b0b12";
}

/** Rasterise the live chart wheel to a PNG data URL, or null if there is no
 *  wheel on screen (chapter I not mounted, or the chart has not cast yet). */
export async function rasteriseWheel(px = WHEEL_PX): Promise<string | null> {
  const svg = document.querySelector<SVGSVGElement>(".wheel-area svg");
  if (!svg) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);

  // A serialized SVG needs its own intrinsic size; the live one is sized by
  // CSS, which does not travel.
  const box = svg.viewBox.baseVal;
  const vbW = box && box.width ? box.width : svg.clientWidth || px;
  const vbH = box && box.height ? box.height : svg.clientHeight || px;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(vbW));
  clone.setAttribute("height", String(vbH));

  const svgText = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

  const img = new Image();
  img.decoding = "sync";
  const loaded = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
  });
  img.src = url;
  if (!(await loaded)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = pageBackground();
  ctx.fillRect(0, 0, px, px);

  // Letterbox rather than stretch — a squashed zodiac wheel is worse than a
  // smaller one.
  const scale = Math.min(px / vbW, px / vbH);
  const w = vbW * scale;
  const h = vbH * scale;
  ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    // A tainted canvas would throw here. The wheel is pure vector with no
    // external references, so this should not happen — but a blank widget is
    // a better outcome than an unhandled rejection during app launch.
    return null;
  }
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** The app-local native plugin that tells the launcher to redraw. See
 *  AstraWidgetPlugin.java — there is no way to broadcast APPWIDGET_UPDATE from
 *  JavaScript, and the provider's updatePeriodMillis is 0 because a timer is
 *  the wrong mechanism when nothing changes except when this app runs. */
interface AstraWidgetPlugin {
  refresh(): Promise<void>;
  canPin(): Promise<{ supported: boolean }>;
  requestPin(): Promise<{ requested: boolean }>;
}

// The plugin handle is held in a module variable and NEVER returned through a
// promise. Both halves of that sentence are load-bearing, and both were found
// on hardware rather than in a browser:
//
//  1. `registerPlugin` returns a PROXY. Resolving any promise with it makes the
//     JS runtime probe the value for a `.then` method to see whether it is
//     thenable — and the proxy answers by forwarding to native as a method call
//     literally named "then", which fails with
//     `"AstraWidget.then()" is not implemented on android`. So an
//     `async function` must not return it, and it must not be a `.then` result.
//  2. Capacitor refuses a second `registerPlugin` for the same name
//     ("Cannot register plugins twice"), so it has to happen once per module,
//     not once per call.
let widgetPlugin: AstraWidgetPlugin | null = null;
let pluginReady: Promise<void> | null = null;

function initPlugin(): Promise<void> {
  if (!pluginReady) {
    pluginReady = (async () => {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        widgetPlugin = registerPlugin<AstraWidgetPlugin>("AstraWidget");
      } catch {
        widgetPlugin = null;
      }
    })();
  }
  return pluginReady;
}

async function refreshWidget(): Promise<void> {
  try {
    await initPlugin();
    await widgetPlugin?.refresh();
  } catch {
    // No widget placed, or an older build without the plugin. The next
    // launcher-initiated update will pick the new data up regardless.
  }
}

/** Whether to offer an "add to home screen" button at all.
 *
 *  False on the web, on Android below 8, and — importantly — on launchers that
 *  do not support pinning, where the request silently does nothing. A button
 *  that appears to do nothing is worse than no button. */
export async function canPinWidget(): Promise<boolean> {
  if (!(await isNative())) return false;
  try {
    await initPlugin();
    if (!widgetPlugin) return false;
    const res = await widgetPlugin.canPin();
    return res?.supported === true;
  } catch {
    return false;
  }
}

/** Ask the launcher to place the widget. The system owns the confirmation
 *  dialog and never reports the outcome back, so the return value means "the
 *  request was made", not "a widget now exists" — and the UI must say so. */
export async function requestPinWidget(): Promise<boolean> {
  try {
    await initPlugin();
    if (!widgetPlugin) return false;
    const res = await widgetPlugin.requestPin();
    return res?.requested === true;
  } catch {
    return false;
  }
}

/**
 * Publish everything the widget needs: today's caption, and a fresh wheel PNG.
 *
 * Best-effort by design. This runs during app launch, and a widget that shows
 * yesterday's wheel is a far smaller problem than a launch that fails because
 * a canvas or a file write misbehaved — so every step swallows its own error
 * and the function always resolves.
 *
 * Returns what actually got written, which is what the tests assert on.
 */
export async function publishWidgetData(
  chart: ChartResponse
): Promise<{ caption: boolean; wheel: boolean }> {
  const result = { caption: false, wheel: false };
  if (!(await isNative())) return result;

  const today = localDateKey();
  try {
    const draw = dailyDrawFor(chart, today);
    await Preferences.set({ key: WIDGET_KEYS.title, value: draw.title });
    await Preferences.set({ key: WIDGET_KEYS.caption, value: draw.line });
    await Preferences.set({ key: WIDGET_KEYS.date, value: today });
    result.caption = true;
  } catch {
    /* the widget keeps whatever it had */
  }

  try {
    const dataUrl = await rasteriseWheel();
    if (dataUrl) {
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      await Filesystem.writeFile({
        path: WHEEL_FILENAME,
        data: base64,
        directory: Directory.Data,
      });
      // The provider reads the FILENAME from prefs rather than hard-coding it,
      // so the two sides cannot disagree about where the image is.
      await Preferences.set({ key: WIDGET_KEYS.wheelFile, value: WHEEL_FILENAME });
      result.wheel = true;
    }
  } catch {
    /* keep the previous wheel */
  }

  // Only worth a redraw if something actually changed.
  if (result.caption || result.wheel) await refreshWidget();

  return result;
}
