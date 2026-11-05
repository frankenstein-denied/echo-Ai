package com.echo.app;

import android.os.Bundle;
import com.echo.app.echo.EchoBridgePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EchoBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
