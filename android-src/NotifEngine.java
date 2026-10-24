package io.github.filipembcruz.kova;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Currency;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Turns bank notifications into Kova transactions.
 * The app sends a "brain" (enabled apps, accounts, learned merchants, blocked messages, rates);
 * detected transactions go to a queue the app merges when it opens.
 * Statuses: pending (ask) · auto (added by itself) · confirmed (from our notification) · ignored · undone.
 */
public final class NotifEngine {
    static final String PREFS = "kova_notif";
    static final String CH_TX = "kova_tx";
    static final String CH_STATUS = "kova_status";
    static final int STATUS_ID = 4242;
    static final String GROUP = "kova_tx_group";

    private NotifEngine() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, 0); }

    static JSONObject obj(SharedPreferences p, String k) {
        try { return new JSONObject(p.getString(k, "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static JSONArray arr(SharedPreferences p, String k) {
        try { return new JSONArray(p.getString(k, "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    /** Remembers which apps post notifications, so the user can pick them in Settings. */
    static synchronized void seen(Context c, String pkg, String label, String sample) { seen(c, pkg, label, sample, null, null, System.currentTimeMillis()); }

    static synchronized void seen(Context c, String pkg, String label, String sample, String title, String body, long when) {
        SharedPreferences p = prefs(c);
        JSONObject s = obj(p, "seen");
        try {
            JSONObject e = s.optJSONObject(pkg);
            if (e == null) e = new JSONObject();
            e.put("label", label);
            e.put("last", System.currentTimeMillis());
            e.put("n", e.optInt("n") + 1);
            if (sample != null && !sample.isEmpty()) e.put("sample", sample.length() > 160 ? sample.substring(0, 160) : sample);
            if (title != null || body != null) {
                JSONArray rec = e.optJSONArray("recent");
                if (rec == null) rec = new JSONArray();
                rec.put(new JSONObject().put("t", title == null ? "" : title).put("b", body == null ? "" : body).put("ts", when));
                while (rec.length() > 5) rec.remove(0);
                e.put("recent", rec);
            }
            s.put(pkg, e);
            if (s.length() > 80) { // drop the oldest
                String oldest = null; long t = Long.MAX_VALUE;
                for (Iterator<String> it = s.keys(); it.hasNext(); ) { String k = it.next(); long l = s.optJSONObject(k).optLong("last"); if (l < t) { t = l; oldest = k; } }
                if (oldest != null) s.remove(oldest);
            }
        } catch (Exception ignored) { }
        p.edit().putString("seen", s.toString()).apply();
    }

    static double rate(JSONObject brain, String cur) {
        JSONObject r = brain.optJSONObject("rates");
        if (r == null || cur == null || cur.isEmpty()) return 0;
        return r.optDouble(cur, 0);
    }

    /** Called for every notification of an enabled app. */
    static synchronized void handle(Context c, String pkg, String label, String title, String text, long when) {
        SharedPreferences p = prefs(c);
        JSONObject brain = obj(p, "brain");
        if (!brain.optBoolean("on")) { log(c, pkg, label, text, when, "off"); return; }
        JSONObject app = brain.optJSONObject("apps") != null ? brain.optJSONObject("apps").optJSONObject(pkg) : null;
        if (app == null || !app.optBoolean("on")) {
            TxParser.Result pr = TxParser.parse(title, text, "");
            if (pr.tx) {
                log(c, pkg, label, text, when, "disabled");
                if (app == null) askEnable(c, brain, pkg, label, pr);
            }
            return;
        }

        // same notification posted again / updated → ignore
        String hash = Integer.toHexString((pkg + "|" + title + "|" + text).hashCode());
        JSONArray hashes = arr(p, "hashes");
        for (int i = 0; i < hashes.length(); i++) if (hash.equals(hashes.optString(i))) { log(c, pkg, label, text, when, "repeat"); return; }
        hashes.put(hash);
        while (hashes.length() > 300) hashes.remove(0);
        p.edit().putString("hashes", hashes.toString()).apply();

        String accId = app.optString("acc");
        JSONObject acc = brain.optJSONObject("accounts") != null ? brain.optJSONObject("accounts").optJSONObject(accId) : null;
        if (acc == null) { log(c, pkg, label, text, when, "no-account"); return; }
        String accCur = acc.optString("cur");

        TxParser.Result r = TxParser.parse(title, text, accCur);
        if (!r.tx) { log(c, pkg, label, text, when, "not-tx:" + r.reason); return; }
        JSONArray blocked = brain.optJSONObject("blocked") != null ? brain.optJSONObject("blocked").optJSONArray(pkg) : null;
        if (blocked != null) for (int i = 0; i < blocked.length(); i++) if (r.tpl.equals(blocked.optString(i))) { log(c, pkg, label, text, when, "blocked"); return; }

        // amount in the account's currency
        String cur = r.currency.isEmpty() ? accCur : r.currency;
        long amt = r.cents;
        boolean curOk = true;
        if (!cur.equals(accCur)) {
            double a = rate(brain, cur), b = rate(brain, accCur);
            if (a > 0 && b > 0) amt = Math.round(r.cents * a / b); else curOk = false;
        }
        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(when));

        JSONArray queue = arr(p, "queue");
        // same purchase twice in a short time (e.g. bank + wallet app) → keep one
        for (int i = 0; i < queue.length(); i++) {
            JSONObject q = queue.optJSONObject(i);
            if (q != null && q.optLong("cents") == r.cents && q.optString("mkey").equals(r.mkey) && Math.abs(q.optLong("ts") - when) < 15 * 60_000) { log(c, pkg, label, text, when, "dup"); return; }
        }
        boolean dup = false;
        JSONArray recent = brain.optJSONArray("recent");
        String fp = accId + "|" + amt + "|" + date;
        if (recent != null) for (int i = 0; i < recent.length(); i++) if (fp.equals(recent.optString(i))) { dup = true; break; }

        JSONObject merchants = brain.optJSONObject("merchants");
        JSONObject m = merchants != null ? merchants.optJSONObject(r.kind + "|" + r.mkey) : null;
        String cat, note;
        int n = 0;
        if (m != null) {
            cat = m.optString("cat");
            note = m.optString("note", r.merchant);
            n = m.optInt("n");
            if (!m.optString("acc").isEmpty() && brain.optJSONObject("accounts").has(m.optString("acc")) && m.optString("acc") != null) {
                // learned account only when it has the same currency as the bank's account
                JSONObject la = brain.optJSONObject("accounts").optJSONObject(m.optString("acc"));
                if (la != null && la.optString("cur").equals(accCur)) accId = m.optString("acc");
            }
        } else {
            JSONObject dc = brain.optJSONObject("defaultCat");
            cat = dc != null ? dc.optString(r.kind) : "";
            note = r.merchant;
        }
        if (r.mkey.isEmpty() && m == null) note = "";

        String mode = app.optString("mode", "smart");
        int autoAfter = brain.optInt("autoAfter", 3);
        boolean auto = !dup && curOk && !cat.isEmpty() && (("auto".equals(mode)) || ("smart".equals(mode) && m != null && n >= autoAfter));

        JSONObject item = new JSONObject();
        try {
            item.put("id", UUID.randomUUID().toString());
            item.put("pkg", pkg);
            item.put("app", label);
            item.put("raw", ((title == null ? "" : title) + " — " + (text == null ? "" : text)).trim());
            item.put("cents", r.cents);
            item.put("cur", cur);
            item.put("amt", amt);
            item.put("acc", accId);
            item.put("kind", r.kind);
            item.put("merchant", r.merchant);
            item.put("mkey", r.mkey);
            item.put("tpl", r.tpl);
            item.put("cat", cat);
            item.put("note", note);
            item.put("date", date);
            item.put("ts", when);
            item.put("dup", dup);
            item.put("curOk", curOk);
            item.put("status", auto ? "auto" : "pending");
        } catch (Exception e) { return; }
        queue.put(item);
        while (queue.length() > 200) queue.remove(0);
        p.edit().putString("queue", queue.toString()).apply();

        log(c, pkg, label, text, when, (auto ? "auto:" : "pending:") + fmt(brain, r.cents, cur) + (r.merchant.isEmpty() ? "" : " · " + r.merchant));
        if (auto && "expense".equals(r.kind)) widgetDelta(c, brain, amt, accCur);
        post(c, brain, item);
        SystemColorPlugin.ping();
    }

    /** What happened to each notification read (shown in Settings → Automatic entries). */
    static synchronized void log(Context c, String pkg, String label, String text, long when, String result) {
        SharedPreferences p = prefs(c);
        JSONArray l = arr(p, "log");
        try {
            String t = text == null ? "" : text;
            l.put(new JSONObject().put("pkg", pkg).put("app", label).put("ts", when).put("text", t.length() > 140 ? t.substring(0, 140) : t).put("result", result));
        } catch (Exception ignored) { }
        while (l.length() > 40) l.remove(0);
        p.edit().putString("log", l.toString()).apply();
    }

    /** A purchase came from an app that is not turned on yet: offer to turn it on (once per app). */
    @SuppressLint("MissingPermission")
    static void askEnable(Context c, JSONObject brain, String pkg, String label, TxParser.Result r) {
        SharedPreferences p = prefs(c);
        JSONArray asked = arr(p, "asked");
        for (int i = 0; i < asked.length(); i++) if (pkg.equals(asked.optString(i))) return;
        asked.put(pkg);
        p.edit().putString("asked", asked.toString()).apply();
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        channels(c, brain);
        JSONObject L = brain.optJSONObject("labels");
        if (L == null) L = new JSONObject();
        String amount = r.currency.isEmpty() ? String.format(Locale.US, "%.2f", r.cents / 100.0) : fmt(brain, r.cents, r.currency);
        String url = "kova://notifsettings?enable=" + Uri.encode(pkg);
        Notification n = new NotificationCompat.Builder(c, CH_TX)
            .setSmallIcon(R.drawable.ic_stat_kova).setColor(0xFF5B3DF5)
            .setContentTitle(L.optString("askTitle", "Purchase detected in {a}").replace("{a}", label) + " · " + amount)
            .setContentText(L.optString("askText", "Turn on reading for this app?"))
            .setAutoCancel(true)
            .setContentIntent(open(c, url, pkg.hashCode()))
            .addAction(0, L.optString("enable", "Turn on"), open(c, url, pkg.hashCode() + 1))
            .build();
        try { NotificationManagerCompat.from(c).notify(pkg.hashCode(), n); } catch (SecurityException ignored) { }
    }

    /** Re-read the last notifications of an app that was just turned on. */
    static void reprocess(Context c, String pkg) {
        JSONObject s = obj(prefs(c), "seen");
        JSONObject e = s.optJSONObject(pkg);
        if (e == null) return;
        JSONArray rec = e.optJSONArray("recent");
        if (rec == null) return;
        long since = System.currentTimeMillis() - 3 * 24 * 3600_000L;
        for (int i = 0; i < rec.length(); i++) {
            JSONObject o = rec.optJSONObject(i);
            if (o == null || o.optLong("ts") < since) continue;
            handle(c, pkg, e.optString("label", pkg), o.optString("t"), o.optString("b"), o.optLong("ts"));
        }
    }

    /** Our own notification for a detected transaction. */
    @SuppressLint("MissingPermission")
    static void post(Context c, JSONObject brain, JSONObject item) {
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        channels(c, brain);
        JSONObject L = brain.optJSONObject("labels");
        if (L == null) L = new JSONObject();
        String id = item.optString("id");
        int nid = id.hashCode();
        String amount = fmt(brain, item.optLong("cents"), item.optString("cur"));
        String who = item.optString("note").isEmpty() ? item.optString("merchant") : item.optString("note");
        String title = ("income".equals(item.optString("kind")) ? "+" : "") + amount + (who.isEmpty() ? "" : " · " + who);
        String catName = name(brain, "cats", item.optString("cat"));
        String accName = name(brain, "accounts", item.optString("acc"));
        String line = catName + " · " + accName + (item.optBoolean("dup") ? " · " + L.optString("dup", "possible duplicate") : "");
        boolean auto = "auto".equals(item.optString("status"));

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_TX)
            .setSmallIcon(R.drawable.ic_stat_kova)
            .setColor(0xFF5B3DF5)
            .setContentTitle(auto ? L.optString("added", "Added") + ": " + title : title)
            .setContentText(auto ? line : line + " · " + L.optString("question", "Confirm?"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(line + "\n" + L.optString("from", "From") + " " + item.optString("app") + ": " + item.optString("raw")))
            .setGroup(GROUP)
            .setAutoCancel(true)
            .setContentIntent(open(c, "kova://notif?id=" + Uri.encode(id), nid))
            .setPriority(auto ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_DEFAULT);
        if (auto) {
            b.addAction(0, L.optString("undo", "Undo"), action(c, "UNDO", id, nid + 3));
            b.setTimeoutAfter(6 * 3600_000L);
        } else {
            b.addAction(0, L.optString("confirm", "Confirm"), action(c, "CONFIRM", id, nid + 1));
            b.addAction(0, L.optString("edit", "Edit"), open(c, "kova://notif?id=" + Uri.encode(id) + "&edit=1", nid + 2));
            b.addAction(0, L.optString("notTx", "Not a transaction"), action(c, "IGNORE", id, nid + 4));
        }
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(c);
            nm.notify(nid, b.build());
            // summary so several detections stay grouped
            Notification sum = new NotificationCompat.Builder(c, CH_TX)
                .setSmallIcon(R.drawable.ic_stat_kova).setColor(0xFF5B3DF5)
                .setContentTitle("Kova").setGroup(GROUP).setGroupSummary(true).setAutoCancel(true).build();
            nm.notify(GROUP.hashCode(), sum);
        } catch (SecurityException ignored) { }
    }

    static String name(JSONObject brain, String section, String id) {
        JSONObject s = brain.optJSONObject(section);
        JSONObject o = s != null ? s.optJSONObject(id) : null;
        return o != null ? o.optString("name") : "—";
    }

    static String fmt(JSONObject brain, long cents, String cur) {
        try {
            String[] lt = brain.optString("locale", "pt-BR").split("-");
            NumberFormat f = NumberFormat.getCurrencyInstance(lt.length > 1 ? new Locale(lt[0], lt[1]) : new Locale(lt[0]));
            f.setCurrency(Currency.getInstance(cur));
            return f.format(cents / 100.0);
        } catch (Exception e) {
            return cur + " " + String.format(Locale.US, "%.2f", cents / 100.0);
        }
    }

    static PendingIntent action(Context c, String act, String id, int code) {
        Intent i = new Intent(c, KovaActionReceiver.class);
        i.setAction("io.github.filipembcruz.kova." + act);
        i.putExtra("id", id);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent open(Context c, String url, int code) { return KovaWidget.link(c, url, code); }

    static void channels(Context c, JSONObject brain) {
        if (Build.VERSION.SDK_INT < 26) return;
        JSONObject L = brain.optJSONObject("labels");
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH_TX, L != null ? L.optString("chTx", "Detected transactions") : "Detected transactions", NotificationManager.IMPORTANCE_DEFAULT));
        NotificationChannel st = new NotificationChannel(CH_STATUS, L != null ? L.optString("chStatus", "Month summary") : "Month summary", NotificationManager.IMPORTANCE_LOW);
        st.setShowBadge(false);
        nm.createNotificationChannel(st);
    }

    /** Resolve a queue item from our notification buttons. Undo after the app already merged it is remembered too. */
    static synchronized void resolve(Context c, String id, String status) {
        SharedPreferences p = prefs(c);
        JSONArray q = arr(p, "queue");
        JSONObject brain = obj(p, "brain");
        boolean found = false;
        for (int i = 0; i < q.length(); i++) {
            JSONObject o = q.optJSONObject(i);
            if (o == null || !id.equals(o.optString("id"))) continue;
            found = true;
            String prev = o.optString("status");
            try { o.put("status", status); } catch (Exception ignored) { }
            JSONObject acc = brain.optJSONObject("accounts") != null ? brain.optJSONObject("accounts").optJSONObject(o.optString("acc")) : null;
            String accCur = acc != null ? acc.optString("cur") : "";
            if ("expense".equals(o.optString("kind"))) {
                if ("confirmed".equals(status) && "pending".equals(prev)) widgetDelta(c, brain, o.optLong("amt"), accCur);
                if ("undone".equals(status) && "auto".equals(prev)) widgetDelta(c, brain, -o.optLong("amt"), accCur);
            }
        }
        if (!found && "undone".equals(status)) {
            try { q.put(new JSONObject().put("id", id).put("status", "undone").put("late", true)); } catch (Exception ignored) { }
        }
        p.edit().putString("queue", q.toString()).apply();
        NotificationManagerCompat.from(c).cancel(id.hashCode());
        SystemColorPlugin.ping();
    }

    /** The app merged these items: drop them from the queue and clear their notifications. */
    static synchronized void ack(Context c, JSONArray ids) {
        SharedPreferences p = prefs(c);
        JSONArray q = arr(p, "queue"), keep = new JSONArray();
        for (int i = 0; i < q.length(); i++) {
            JSONObject o = q.optJSONObject(i);
            boolean drop = false;
            for (int k = 0; k < ids.length(); k++) if (o != null && ids.optString(k).equals(o.optString("id"))) { drop = true; break; }
            if (drop) {
                if (!"auto".equals(o.optString("status"))) NotificationManagerCompat.from(c).cancel(o.optString("id").hashCode());
            } else keep.put(o);
        }
        p.edit().putString("queue", keep.toString()).apply();
    }

    /** Keeps the widget total right after a confirm/undo made without opening the app. */
    static void widgetDelta(Context c, JSONObject brain, long amt, String accCur) {
        double a = rate(brain, accCur);
        long base = a > 0 ? Math.round(amt * a) : amt;
        SharedPreferences w = c.getSharedPreferences(KovaWidget.PREFS, 0);
        w.edit().putLong("delta", w.getLong("delta", 0) + base).apply();
        try { KovaWidget.updateAll(c); } catch (Exception ignored) { }
    }

    /** Optional ongoing notification with the month total and a quick "+ Expense". */
    @SuppressLint("MissingPermission")
    static void status(Context c, boolean show, String title, String text, String addLabel) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!show) { nm.cancel(STATUS_ID); return; }
        if (!nm.areNotificationsEnabled()) return;
        channels(c, obj(prefs(c), "brain"));
        Notification n = new NotificationCompat.Builder(c, CH_STATUS)
            .setSmallIcon(R.drawable.ic_stat_kova)
            .setColor(0xFF5B3DF5)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open(c, "kova://home", 31))
            .addAction(0, addLabel, open(c, "kova://add?kind=expense", 32))
            .build();
        try { nm.notify(STATUS_ID, n); } catch (SecurityException ignored) { }
    }
}
