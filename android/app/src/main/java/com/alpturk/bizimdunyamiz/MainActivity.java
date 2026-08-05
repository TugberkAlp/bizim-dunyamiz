package com.alpturk.bizimdunyamiz; // Ekran görüntüsünden paket adını teyit ettik :)

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Uygulama açıldığında servisi direkt başlatma, önce izni kontrol et!
        checkPermissionsAndStartService();
    }

    private void checkPermissionsAndStartService() {
        // Eğer konum izni verilmemişse, kullanıcıdan iste
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, PERMISSION_REQ_CODE);
        } else {
            // İzin zaten varsa (önceden verilmişse) servisi gönül rahatlığıyla başlat
            startTrackerService();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        // Kullanıcı ekrandaki izin penceresine cevap verdiğinde tetiklenir
        if (requestCode == PERMISSION_REQ_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // Kullanıcı onayladıysa servisi ateşle
                startTrackerService();
            }
        }
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