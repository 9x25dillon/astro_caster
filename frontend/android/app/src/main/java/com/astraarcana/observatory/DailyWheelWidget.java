package com.astraarcana.observatory;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.widget.RemoteViews;

import java.io.File;

/**
 * The home-screen widget: the chart wheel, with the day's card beneath it.
 *
 * This class draws nothing itself. The wheel is an SVG rendered by the web app,
 * and an app widget cannot host a WebView — RemoteViews supports ImageView,
 * TextView and little else. So the app rasterises its own wheel to a PNG while
 * it is running (see widgetBridge.ts) and leaves it in internal storage, along
 * with the caption in the SharedPreferences file that @capacitor/preferences
 * writes. This provider reads both and hands them to RemoteViews.
 *
 * That split is deliberate. Redrawing the wheel here in Java would be a second
 * renderer for the app's signature image with nothing asserting the two agree,
 * and every unwitnessed second implementation in this project has drifted.
 *
 * The consequence to hold onto: this provider runs when the app does NOT, so
 * everything it reads may be stale, missing, or half-written. Every read has a
 * fallback and none of them are exceptional — a widget that shows yesterday's
 * wheel is working; a widget that crashes is uninstalled.
 */
public class DailyWheelWidget extends AppWidgetProvider {

    /** The SharedPreferences file @capacitor/preferences uses by default. Its
     *  Android implementation calls getSharedPreferences(configuration.group),
     *  and the default group is "CapacitorStorage". Keys are stored unprefixed. */
    private static final String PREFS = "CapacitorStorage";

    // Mirrors WIDGET_KEYS in widgetBridge.ts. Two hard-coded copies of a string
    // is a real risk, so the FILENAME is not one of them — it is read from
    // prefs, so the two sides cannot disagree about where the image lives.
    private static final String KEY_TITLE = "aae.widget.title";
    private static final String KEY_CAPTION = "aae.widget.caption";
    private static final String KEY_WHEEL_FILE = "aae.widget.wheel_file";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    /** Rebuild every instance. Called by the provider itself and available to
     *  the app after it republishes, via an ACTION_APPWIDGET_UPDATE broadcast. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new android.content.ComponentName(context, DailyWheelWidget.class));
        if (ids == null || ids.length == 0) {
            return;
        }
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_daily_wheel);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        String title = prefs.getString(KEY_TITLE, null);
        String caption = prefs.getString(KEY_CAPTION, null);

        // Before the app has ever run there is nothing to show, and saying so
        // is better than an empty rectangle the reader reads as broken.
        views.setTextViewText(R.id.widget_title, title != null ? title : "Astra Arcana");
        views.setTextViewText(
                R.id.widget_caption,
                caption != null ? caption : "Open Astra to cast your wheel.");

        Bitmap wheel = readWheel(context, prefs);
        if (wheel != null) {
            views.setImageViewBitmap(R.id.widget_wheel, wheel);
        } else {
            // Leave whatever the layout ships with rather than blanking it.
            views.setImageViewResource(R.id.widget_wheel, R.mipmap.ic_launcher_foreground);
        }

        views.setOnClickPendingIntent(R.id.widget_root, launchIntent(context));
        return views;
    }

    private static Bitmap readWheel(Context context, SharedPreferences prefs) {
        String name = prefs.getString(KEY_WHEEL_FILE, null);
        if (name == null) {
            return null;
        }
        // Filesystem's Directory.Data is the app's files dir. Confine the read
        // to a bare filename so a corrupted pref cannot walk the path.
        if (name.contains("/") || name.contains("..")) {
            return null;
        }
        File f = new File(context.getFilesDir(), name);
        if (!f.exists() || f.length() == 0) {
            return null;
        }
        try {
            // decodeFile returns null on a truncated or half-written file rather
            // than throwing — which is the likely state if the app was killed
            // mid-write, so it is the case that actually happens.
            return BitmapFactory.decodeFile(f.getAbsolutePath());
        } catch (Throwable t) {
            // OutOfMemoryError included: a widget must never take the launcher
            // down with it.
            return null;
        }
    }

    private static PendingIntent launchIntent(Context context) {
        Intent intent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            intent = new Intent(context, MainActivity.class);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
