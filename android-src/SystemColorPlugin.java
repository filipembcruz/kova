package io.github.filipembcruz.kova;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import androidx.core.content.FileProvider;
import java.io.File;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Edge-to-edge helper: reports system bar / keyboard insets to the web layer (as CSS pixels)
 * and switches the status/navigation bar icon colour to match the screen behind them.
 */
@CapacitorPlugin(name = "SystemColor")
public class SystemColorPlugin extends Plugin {
    private JSObject last = new JSObject();

    @Override
    public void load() {
        final View wv = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            float d = v.getResources().getDisplayMetrics().density;
            JSObject o = new JSObject();
            o.put("top", bars.top / d);
            o.put("bottom", bars.bottom / d);
            o.put("ime", Math.max(0, ime.bottom - bars.bottom) / d);
            last = o;
            notifyListeners("insets", o);
            return insets;
        });
        wv.post(() -> ViewCompat.requestApplyInsets(wv));
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        call.resolve(last);
    }

    @PluginMethod
    public void set(PluginCall call) {
        final String hex = call.getString("color", "#f4f5fa");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        final boolean navDark = Boolean.TRUE.equals(call.getBoolean("navDark", dark));
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                w.getDecorView().setBackgroundColor(Color.parseColor(hex));
                WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(w, w.getDecorView());
                ic.setAppearanceLightStatusBars(!dark);
                ic.setAppearanceLightNavigationBars(!navDark);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    /** Opens a cached file (PDF, image) in the phone's own viewer app. */
    @PluginMethod
    public void openFile(PluginCall call) {
        String path = call.getString("path");
        String mime = call.getString("mime", "*/*");
        if (path == null) { call.reject("NO_PATH"); return; }
        try {
            File f = new File(Uri.parse(path).getPath());
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("NO_APP");
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
