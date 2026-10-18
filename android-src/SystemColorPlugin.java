package io.github.filipembcruz.kova;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Colours the system bars (and the area behind them on Android 15+ edge-to-edge) to match the app theme. */
@CapacitorPlugin(name = "SystemColor")
public class SystemColorPlugin extends Plugin {

    static void apply(Activity activity, int color, boolean dark) {
        Window w = activity.getWindow();
        View decor = w.getDecorView();
        decor.setBackgroundColor(color);
        View content = activity.findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(color);
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(color);
            w.setNavigationBarColor(color);
        }
        WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(w, decor);
        ic.setAppearanceLightStatusBars(!dark);
        ic.setAppearanceLightNavigationBars(!dark);
    }

    @PluginMethod
    public void set(PluginCall call) {
        final String hex = call.getString("color", "#eef0f5");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            try {
                int c = Color.parseColor(hex);
                apply(getActivity(), c, dark);
                if (getBridge() != null && getBridge().getWebView() != null) {
                    View parent = (View) getBridge().getWebView().getParent();
                    if (parent != null) parent.setBackgroundColor(c);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
