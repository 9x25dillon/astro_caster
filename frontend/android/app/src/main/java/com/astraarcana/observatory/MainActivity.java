package com.astraarcana.observatory;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Keeps the observatory out from under the system bars.
 *
 * WHY THIS IS NATIVE AND NOT CSS. The shell already sets `viewport-fit=cover`
 * and theme.css already pads `.app` with `env(safe-area-inset-*)`, which is
 * what makes iOS behave. On Android that does nothing: the WebView populates
 * `env(safe-area-inset-*)` from DISPLAY CUTOUTS, not from the status bar. On a
 * Pixel 10a the top inset resolves to 0, so the masthead's absolutely-pinned
 * action pills rendered underneath the clock and battery icons — measured on
 * hardware, not guessed. No CSS change could have fixed it.
 *
 * Since Android 15 an app targeting SDK 35+ is drawn edge-to-edge whether it
 * asks to be or not, and the temporary `windowOptOutEdgeToEdgeEnforcement`
 * escape hatch is already on its way out. So rather than opt out, consume the
 * insets properly: pad the content view by the system-bar insets and let the
 * web layer keep believing it owns a rectangle that starts at (0, 0).
 *
 * `systemBars()` covers the status bar and the navigation bar/gesture pill, so
 * this fixes the bottom edge — where the chapter dial lives — at the same time.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            // Do NOT return CONSUMED: the keyboard (ime) inset has to keep
            // propagating, or a focused input scrolls under the keyboard.
            return windowInsets;
        });
    }
}
