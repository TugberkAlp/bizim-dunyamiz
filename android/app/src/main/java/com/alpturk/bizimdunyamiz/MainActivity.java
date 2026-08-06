package com.alpturk.bizimdunyamiz;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(PushNotificationsPlugin.class);
        registerPlugin(UserStoragePlugin.class);
        checkPermissionsAndStartService();
    }

    @CapacitorPlugin(name = "UserStorage")
    public static class UserStoragePlugin extends com.getcapacitor.Plugin {
        @PluginMethod
        public void setUsername(PluginCall call) {
            String username = call.getString("username");
            if(username != null) {
                SharedPreferences prefs = getContext().getSharedPreferences("BizimAyarlar", Context.MODE_PRIVATE);
                prefs.edit().putString("aktif_kullanici", username).apply();
                call.resolve();
            } else {
                call.reject("Kullanıcı adı boş olamaz!");
            }
        }
    }


    private void checkPermissionsAndStartService() {
        boolean needsLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED;
        boolean needsNotification = false;

        // Android 13 ve üzeri için bildirim izni kontrolü
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needsNotification = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
        }

        // Eğer konum VEYA bildirim izninden biri bile eksikse, izin ekranını çıkar
        if (needsLocation || needsNotification) {
            ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.POST_NOTIFICATIONS
            }, PERMISSION_REQ_CODE);
        } else {
            startTrackerService();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        startTrackerService(); // İzin verilse de verilmese de servisi başlatmayı dene
    }


    private void startTrackerService() {
        try {
            Intent serviceIntent = new Intent(this, TrackerService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}