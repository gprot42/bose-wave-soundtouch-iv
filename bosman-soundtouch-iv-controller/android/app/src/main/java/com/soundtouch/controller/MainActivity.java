package com.soundtouch.controller;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int LOCAL_NETWORK_PERMISSION_REQUEST = 41001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WifiInfoPlugin.class);
        super.onCreate(savedInstanceState);
        requestLocalNetworkPermissions();
    }

    private void requestLocalNetworkPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES)
                != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[] { Manifest.permission.NEARBY_WIFI_DEVICES },
                    LOCAL_NETWORK_PERMISSION_REQUEST
                );
            }
        }
    }
}
