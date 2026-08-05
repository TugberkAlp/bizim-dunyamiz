package com.alpturk.bizimdunyamiz;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // UYGULAMA AÇILDIĞINDA ÖLÜMSÜZ YEREL SERVİSİ BAŞLAT
        Intent serviceIntent = new Intent(this, TrackerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }
}