package io.github.filipembcruz.kova;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.fragment.app.FragmentActivity;
import java.io.File;
import android.content.ComponentName;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
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
    private static SystemColorPlugin instance;

    /** Tells the open app that the notification queue changed. */
    static void ping() {
        SystemColorPlugin p = instance;
        if (p != null) try { p.notifyListeners("notif", new JSObject()); } catch (Exception ignored) { }
    }

    @Override
    public void load() {
        instance = this;
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

    private static final int BIO = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void biometricAvailable(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", BiometricManager.from(getContext()).canAuthenticate(BIO) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(o);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        final String title = call.getString("title", "Kova");
        final String cancel = call.getString("cancel", "PIN");
        getActivity().runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) getActivity(), ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { call.resolve(); }
                        @Override
                        public void onAuthenticationError(int code, CharSequence msg) { call.reject(String.valueOf(msg), String.valueOf(code)); }
                    });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title).setNegativeButtonText(cancel).setAllowedAuthenticators(BIO).build();
                prompt.authenticate(info);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    /** Saves the widget summary sent by the app and redraws the home-screen widgets. */
    @PluginMethod
    public void setWidget(PluginCall call) {
        getContext().getSharedPreferences(KovaWidget.PREFS, 0).edit().putString("data", call.getString("data", "{}")).putLong("delta", 0).apply();
        try { KovaWidget.updateAll(getContext()); } catch (Exception ignored) { }
        call.resolve();
    }

    // ---------- reading bank notifications ----------
    @PluginMethod
    public void notifStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("access", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        o.put("post", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        boolean battery = true;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            battery = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception ignored) { }
        o.put("battery", battery);
        call.resolve(o);
    }

    @PluginMethod
    public void openNotifAccess(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void openBattery(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void notifSeen(PluginCall call) {
        JSObject o = new JSObject();
        o.put("data", NotifEngine.prefs(getContext()).getString("seen", "{}"));
        call.resolve(o);
    }

    @PluginMethod
    public void setNotifBrain(PluginCall call) {
        NotifEngine.prefs(getContext()).edit().putString("brain", call.getString("data", "{}")).apply();
        call.resolve();
    }

    @PluginMethod
    public void getNotifQueue(PluginCall call) {
        JSObject o = new JSObject();
        o.put("data", NotifEngine.prefs(getContext()).getString("queue", "[]"));
        call.resolve(o);
    }

    @PluginMethod
    public void ackNotif(PluginCall call) {
        try { NotifEngine.ack(getContext(), new JSONArray(call.getString("ids", "[]"))); } catch (Exception ignored) { }
        call.resolve();
    }

    @PluginMethod
    public void parseTest(PluginCall call) {
        TxParser.Result r = TxParser.parse(call.getString("title", ""), call.getString("text", ""), call.getString("cur", ""));
        JSObject o = new JSObject();
        o.put("tx", r.tx);
        o.put("cents", r.cents);
        o.put("cur", r.currency);
        o.put("kind", r.kind);
        o.put("merchant", r.merchant);
        o.put("reason", r.reason);
        call.resolve(o);
    }

    @PluginMethod
    public void setStatusNotif(PluginCall call) {
        NotifEngine.status(getContext(), Boolean.TRUE.equals(call.getBoolean("show", false)), call.getString("title", "Kova"), call.getString("text", ""), call.getString("add", "+"));
        call.resolve();
    }
}
