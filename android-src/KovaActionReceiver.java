package io.github.filipembcruz.kova;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Buttons on Kova's notifications: Confirm, Not a transaction, Undo — without opening the app. */
public class KovaActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        String a = i.getAction();
        if (id == null || a == null) return;
        if (a.endsWith(".CONFIRM")) NotifEngine.resolve(c, id, "confirmed");
        else if (a.endsWith(".IGNORE")) NotifEngine.resolve(c, id, "ignored");
        else if (a.endsWith(".UNDO")) NotifEngine.resolve(c, id, "undone");
    }
}
