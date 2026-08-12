package com.astraarcana.observatory;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * One method: "the widget's data changed, redraw it now".
 *
 * Without this, a republished wheel would not appear until the launcher next
 * decided to update the widget — and `updatePeriodMillis` is 0 precisely
 * because a timer is the wrong mechanism here (nothing changes except when the
 * app runs). So the app has to say so, and saying so requires native code:
 * there is no way to broadcast an APPWIDGET_UPDATE from JavaScript.
 *
 * Deliberately not a published plugin package. It is thirty lines that belong
 * to this app's widget, and giving it a version and a README would imply a
 * contract with somebody else.
 */
@CapacitorPlugin(name = "AstraWidget")
public class AstraWidgetPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        try {
            DailyWheelWidget.refreshAll(getContext());
            call.resolve();
        } catch (Throwable t) {
            // The widget is a courtesy. A failure to redraw it must never
            // surface as an app-level error during launch.
            call.resolve();
        }
    }

    /**
     * Whether this launcher will accept a pin request at all.
     *
     * Two separate things can be false: the API needs Android 8, and the
     * LAUNCHER has to support pinning — several do not, and the request simply
     * does nothing on those. Reporting both as one "no" lets the UI hide a
     * button that would otherwise appear to do nothing when tapped.
     */
    @PluginMethod
    public void canPin(PluginCall call) {
        JSObject out = new JSObject();
        boolean ok = false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AppWidgetManager mgr = getContext().getSystemService(AppWidgetManager.class);
                ok = mgr != null && mgr.isRequestPinAppWidgetSupported();
            }
        } catch (Throwable ignored) {
            // Treated as "cannot pin" — the widget is still placeable by hand.
        }
        out.put("supported", ok);
        call.resolve(out);
    }

    /** Ask the launcher to place the widget. The system shows its own
     *  confirmation; we are never told the outcome, which is why the UI says
     *  what it asked for rather than claiming what happened. */
    @PluginMethod
    public void requestPin(PluginCall call) {
        JSObject out = new JSObject();
        boolean asked = false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AppWidgetManager mgr = getContext().getSystemService(AppWidgetManager.class);
                ComponentName provider =
                        new ComponentName(getContext(), DailyWheelWidget.class);
                if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
                    asked = mgr.requestPinAppWidget(provider, null, null);
                }
            }
        } catch (Throwable ignored) {
            // asked stays false
        }
        out.put("requested", asked);
        call.resolve(out);
    }
}
