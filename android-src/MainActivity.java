package io.github.filipembcruz.kova;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemColorPlugin.class);
        super.onCreate(savedInstanceState);
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
}
