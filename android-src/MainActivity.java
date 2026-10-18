package io.github.filipembcruz.kova;

import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemColorPlugin.class);
        super.onCreate(savedInstanceState);
        // Paint the area behind the status and navigation bars like the app until the web layer sets its theme.
        SystemColorPlugin.apply(this, Color.parseColor("#eef0f5"), false);
    }
}
