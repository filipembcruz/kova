package io.github.filipembcruz.kova;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Date;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Any crash leaves a note in files/crash.txt; the app shows it on the next start.
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            note(sw.toString());
            if (prev != null) prev.uncaughtException(t, e);
        });
        registerPlugin(SystemColorPlugin.class);
        super.onCreate(savedInstanceState);
        // If the web engine dies (e.g. out of memory) reload instead of closing the app.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                note("WebView renderer gone (crash=" + (Build.VERSION.SDK_INT >= 26 && detail.didCrash()) + ")");
                runOnUiThread(() -> recreate());
                return true;
            }
        });
        // Draw edge-to-edge on every Android version; the web layer pads itself with the real insets.
        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            w.setNavigationBarContrastEnforced(false);
            w.setStatusBarContrastEnforced(false);
        }
        w.getDecorView().setBackgroundColor(Color.parseColor("#f4f5fa"));
    }

    private void note(String text) {
        try (FileWriter w = new FileWriter(new File(getFilesDir(), "crash.txt"), true)) {
            w.write(new Date() + " · Android " + Build.VERSION.RELEASE + " · " + Build.MODEL + "\n" + text + "\n\n");
        } catch (Throwable ignored) { }
    }
}
