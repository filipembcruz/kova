package io.github.filipembcruz.kova;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/** Listens to notifications (with the user's permission) and hands bank ones to NotifEngine. */
public class KovaNotificationListener extends NotificationListenerService {
    private static volatile KovaNotificationListener instance;

    @Override
    public void onListenerConnected() {
        instance = this;
        scanActive(null); // notifications already in the shade when the service (re)connects
    }

    @Override
    public void onListenerDisconnected() {
        if (instance == this) instance = null;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        process(sbn);
    }

    /** Re-reads the notifications still in the notification shade (all apps, or only one). */
    static void scanActive(String onlyPkg) {
        KovaNotificationListener l = instance;
        if (l == null) return;
        try {
            StatusBarNotification[] list = l.getActiveNotifications();
            if (list == null) return;
            for (StatusBarNotification sbn : list) {
                if (onlyPkg == null || onlyPkg.equals(sbn.getPackageName())) l.process(sbn);
            }
        } catch (Exception ignored) { }
    }

    void process(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName()) || pkg.equals("android") || pkg.startsWith("com.android.systemui")) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            if (sbn.isOngoing()) return; // music players, downloads, navigation…
            Bundle x = n.extras;
            if (x == null) return;
            CharSequence title = x.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence text = big != null ? big : x.getCharSequence(Notification.EXTRA_TEXT);
            String t = title == null ? "" : title.toString();
            String b = text == null ? "" : text.toString();
            if (t.isEmpty() && b.isEmpty()) return;
            String label = pkg;
            try {
                PackageManager pm = getPackageManager();
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                label = pm.getApplicationLabel(ai).toString();
            } catch (Exception ignored) { }
            NotifEngine.seen(this, pkg, label, (t + " — " + b).trim(), t, b, sbn.getPostTime());
            NotifEngine.handle(this, pkg, label, t, b, sbn.getPostTime());
        } catch (Exception ignored) { }
    }
}
