package io.github.filipembcruz.kova;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget (4x2): month-to-date spending, comparison with the same day of last month,
 * a bar with the top categories and quick-add buttons. Data comes from the app (SystemColor.setWidget).
 */
public class KovaWidget extends AppWidgetProvider {
    static final String PREFS = "kova_widget";

    protected boolean isSmall() { return false; }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(c, m, id, isSmall());
    }

    public static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, KovaWidget.class))) render(c, m, id, false);
        for (int id : m.getAppWidgetIds(new ComponentName(c, KovaWidgetSmall.class))) render(c, m, id, true);
    }

    static PendingIntent link(Context c, String url, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void render(Context c, AppWidgetManager m, int id, boolean small) {
        RemoteViews v = new RemoteViews(c.getPackageName(), small ? R.layout.widget_small : R.layout.widget_main);
        JSONObject j;
        try { j = new JSONObject(c.getSharedPreferences(PREFS, 0).getString("data", "{}")); } catch (Exception e) { j = new JSONObject(); }

        Date now = new Date();
        String monthKey = new SimpleDateFormat("yyyy-MM", Locale.US).format(now);
        boolean sameMonth = monthKey.equals(j.optString("month"));
        boolean hide = j.optBoolean("hide", false);
        boolean hasData = j.has("month");

        String mName = new SimpleDateFormat("LLLL", Locale.getDefault()).format(now);
        mName = mName.substring(0, 1).toUpperCase() + mName.substring(1);
        v.setTextViewText(R.id.w_title, hasData ? mName + " · " + j.optString("spentWord", "") : "Kova");
        String amount = !hasData ? "—" : hide ? "••••" : sameMonth ? j.optString("spentFmt") : j.optString("zeroFmt", "—");
        v.setTextViewText(R.id.w_amount, amount);

        // same-day comparison with last month
        v.setViewVisibility(R.id.w_cmp, View.GONE);
        JSONArray prev = j.optJSONArray("prevCum");
        if (sameMonth && !hide && prev != null && prev.length() > 0) {
            int day = Calendar.getInstance().get(Calendar.DAY_OF_MONTH);
            long p = prev.optLong(Math.min(day, prev.length()) - 1);
            long spent = j.optLong("spent");
            if (p > 0) {
                long pct = Math.round((spent - p) * 100.0 / p);
                v.setTextViewText(R.id.w_cmp, (pct > 0 ? "+" : "") + pct + "% " + j.optString("vsLabel"));
                v.setTextColor(R.id.w_cmp, pct > 0 ? Color.parseColor("#FFC2C2") : Color.parseColor("#B9F6D4"));
                v.setViewVisibility(R.id.w_cmp, View.VISIBLE);
            }
        }

        v.setOnClickPendingIntent(R.id.w_root, link(c, "kova://home", 1));
        v.setOnClickPendingIntent(R.id.w_add, link(c, "kova://add?kind=expense", 2));

        if (!small) {
            v.setTextViewText(R.id.w_add, j.optString("addLabel", "+"));
            JSONArray cats = j.optJSONArray("cats");
            long other = j.optLong("other");
            v.setImageViewBitmap(R.id.w_bar, bar(sameMonth ? cats : null, sameMonth ? other : 0));
            SpannableStringBuilder sb = new SpannableStringBuilder();
            if (sameMonth && cats != null) {
                for (int i = 0; i < cats.length(); i++) {
                    JSONObject o = cats.optJSONObject(i);
                    if (o == null) continue;
                    if (sb.length() > 0) sb.append("   ");
                    int st = sb.length();
                    sb.append("● ");
                    sb.setSpan(new ForegroundColorSpan(safeColor(o.optString("color"))), st, st + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    sb.append(o.optString("name"));
                    if (!hide) sb.append(" ").append(o.optString("fmt"));
                }
            }
            v.setTextViewText(R.id.w_legend, sb);
            JSONArray sc = j.optJSONArray("shortcuts");
            int[] slots = { R.id.w_sc1, R.id.w_sc2 };
            for (int i = 0; i < slots.length; i++) {
                JSONObject o = sc != null ? sc.optJSONObject(i) : null;
                if (o == null) { v.setViewVisibility(slots[i], View.GONE); continue; }
                v.setViewVisibility(slots[i], View.VISIBLE);
                v.setTextViewText(slots[i], "⚡ " + o.optString("label"));
                v.setOnClickPendingIntent(slots[i], link(c, "kova://add?sc=" + Uri.encode(o.optString("id")), 10 + i));
            }
        }
        m.updateAppWidget(id, v);
    }

    static int safeColor(String hex) {
        try { return Color.parseColor(hex); } catch (Exception e) { return Color.WHITE; }
    }

    /** Rounded horizontal bar split by the top categories (+ "other"). */
    static Bitmap bar(JSONArray cats, long other) {
        int w = 600, h = 20;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), h / 2f, h / 2f, Path.Direction.CW);
        cv.clipPath(clip);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.parseColor("#33FFFFFF"));
        cv.drawRect(0, 0, w, h, p);
        long total = other;
        if (cats != null) for (int i = 0; i < cats.length(); i++) total += cats.optJSONObject(i).optLong("value");
        if (total <= 0) return b;
        float x = 0, gap = 4;
        if (cats != null) {
            for (int i = 0; i < cats.length(); i++) {
                JSONObject o = cats.optJSONObject(i);
                float wd = w * (o.optLong("value") / (float) total);
                p.setColor(safeColor(o.optString("color")));
                cv.drawRect(x, 0, Math.max(x, x + wd - gap), h, p);
                x += wd;
            }
        }
        if (other > 0) {
            p.setColor(Color.parseColor("#80FFFFFF"));
            cv.drawRect(x, 0, w, h, p);
        }
        return b;
    }
}
