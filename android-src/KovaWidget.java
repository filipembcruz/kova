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
import android.os.Bundle;
import android.graphics.DashPathEffect;
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

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        render(c, m, id, isSmall());
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
        long delta = c.getSharedPreferences(PREFS, 0).getLong("delta", 0);
        long spentNow = j.optLong("spent") + (sameMonth ? delta : 0);
        String spentFmt = j.optString("spentFmt");
        if (delta != 0 && sameMonth) {
            try {
                String[] lt = j.optString("locale", "pt-BR").split("-");
                java.text.NumberFormat f = java.text.NumberFormat.getCurrencyInstance(lt.length > 1 ? new Locale(lt[0], lt[1]) : new Locale(lt[0]));
                f.setCurrency(java.util.Currency.getInstance(j.optString("base", "BRL")));
                spentFmt = f.format(spentNow / 100.0);
            } catch (Exception ignored) { }
        }
        String amount = !hasData ? "—" : hide ? "••••" : sameMonth ? spentFmt : j.optString("zeroFmt", "—");
        v.setTextViewText(R.id.w_amount, amount);

        // same-day comparison with last month
        v.setViewVisibility(R.id.w_cmp, View.GONE);
        JSONArray prev = j.optJSONArray("prevCum");
        if (sameMonth && !hide && prev != null && prev.length() > 0) {
            int day = Calendar.getInstance().get(Calendar.DAY_OF_MONTH);
            long p = prev.optLong(Math.min(day, prev.length()) - 1);
            long spent = spentNow;
            if (p > 0) {
                long pct = Math.round((spent - p) * 100.0 / p);
                v.setTextViewText(R.id.w_cmp, (pct > 0 ? "+" : "") + pct + "% " + j.optString("vsLabel").replace("%d", String.valueOf(Math.min(day, prev.length()))));
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

            // running-total chart in the space left when the widget is taller
            Bundle opt = m.getAppWidgetOptions(id);
            int wDp = opt != null ? opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
            int hDp = opt != null ? opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110) : 110;
            int chartDp = hDp - 156;
            if (sameMonth && chartDp >= 34 && !hide) {
                float d = Math.min(c.getResources().getDisplayMetrics().density, 2.5f);
                v.setImageViewBitmap(R.id.w_chart, chart(j.optJSONArray("curCum"), prev, Math.max(120, wDp - 32), chartDp, d, j.optString("curName"), j.optString("prevName")));
                v.setViewVisibility(R.id.w_chart, View.VISIBLE);
            } else {
                v.setViewVisibility(R.id.w_chart, View.GONE);
            }
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

    /** This month's running total (solid) against last month's (dashed). */
    static Bitmap chart(JSONArray cur, JSONArray prev, int wDp, int hDp, float d, String curName, String prevName) {
        int w = Math.round(wDp * d), h = Math.round(hDp * d);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        int days = Math.max(31, prev != null ? prev.length() : 0);
        long max = 1;
        if (cur != null) for (int i = 0; i < cur.length(); i++) max = Math.max(max, cur.optLong(i));
        if (prev != null) for (int i = 0; i < prev.length(); i++) max = Math.max(max, prev.optLong(i));
        float top = 16 * d, bottom = h - 3 * d, left = 2 * d, right = w - 2 * d;
        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(Color.parseColor("#26FFFFFF"));
        grid.setStrokeWidth(1 * d);
        cv.drawLine(left, bottom, right, bottom, grid);
        cv.drawLine(left, (top + bottom) / 2, right, (top + bottom) / 2, grid);

        if (prev != null && prev.length() > 1) {
            Path pp = new Path();
            for (int i = 0; i < prev.length(); i++) {
                float x = left + (right - left) * i / (days - 1f), y = bottom - (bottom - top) * prev.optLong(i) / (float) max;
                if (i == 0) pp.moveTo(x, y); else pp.lineTo(x, y);
            }
            Paint pl = new Paint(Paint.ANTI_ALIAS_FLAG);
            pl.setStyle(Paint.Style.STROKE);
            pl.setStrokeWidth(2 * d);
            pl.setColor(Color.parseColor("#80FFFFFF"));
            pl.setPathEffect(new DashPathEffect(new float[] { 5 * d, 4 * d }, 0));
            cv.drawPath(pp, pl);
        }
        if (cur != null && cur.length() > 0) {
            Path cp = new Path(), fill = new Path();
            float lx = left, ly = bottom;
            for (int i = 0; i < cur.length(); i++) {
                float x = left + (right - left) * i / (days - 1f), y = bottom - (bottom - top) * cur.optLong(i) / (float) max;
                if (i == 0) { cp.moveTo(x, y); fill.moveTo(x, bottom); fill.lineTo(x, y); } else { cp.lineTo(x, y); fill.lineTo(x, y); }
                lx = x; ly = y;
            }
            fill.lineTo(lx, bottom);
            fill.close();
            Paint f = new Paint(Paint.ANTI_ALIAS_FLAG);
            f.setColor(Color.parseColor("#2EFFFFFF"));
            cv.drawPath(fill, f);
            Paint cl = new Paint(Paint.ANTI_ALIAS_FLAG);
            cl.setStyle(Paint.Style.STROKE);
            cl.setStrokeWidth(3 * d);
            cl.setStrokeCap(Paint.Cap.ROUND);
            cl.setStrokeJoin(Paint.Join.ROUND);
            cl.setColor(Color.WHITE);
            cv.drawPath(cp, cl);
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(Color.WHITE);
            cv.drawCircle(lx, ly, 4.5f * d, dot);
        }
        // legend: ── Oct   - - Sep
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setTextSize(10.5f * d);
        t.setColor(Color.parseColor("#E6FFFFFF"));
        Paint s1 = new Paint(Paint.ANTI_ALIAS_FLAG);
        s1.setStrokeWidth(3 * d);
        s1.setColor(Color.WHITE);
        float y0 = 9 * d;
        cv.drawLine(left, y0 - 3 * d, left + 14 * d, y0 - 3 * d, s1);
        cv.drawText(curName, left + 18 * d, y0, t);
        float x2 = left + 26 * d + t.measureText(curName);
        Paint s2 = new Paint(s1);
        s2.setStrokeWidth(2 * d);
        s2.setColor(Color.parseColor("#80FFFFFF"));
        s2.setPathEffect(new DashPathEffect(new float[] { 4 * d, 3 * d }, 0));
        cv.drawLine(x2, y0 - 3 * d, x2 + 14 * d, y0 - 3 * d, s2);
        cv.drawText(prevName, x2 + 18 * d, y0, t);
        return b;
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
