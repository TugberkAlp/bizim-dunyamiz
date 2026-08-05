package com.alpturk.bizimdunyamiz;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class TrackerService extends Service {
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;

    // DİKKAT: APK'yı kimin için alıyorsan onu yaz! Kendi telefonun için "alpturk", Elif için "elif" yapacaksın.
    private final String CURRENT_USER = "alpturk";

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
        startForeground(1, getNotification());
        requestLocationUpdates();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("TrackerChannel", "Canlı Konum", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification getNotification() {
        return new NotificationCompat.Builder(this, "TrackerChannel")
                .setContentTitle("Bizim Dünyamız")
                .setContentText("Konum arka planda güvenle güncelleniyor 💖")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation) // İstersen kendi uygulamanın ikonunu koyabilirsin
                .build();
    }

    @SuppressLint("MissingPermission")
    private void requestLocationUpdates() {
        LocationRequest locationRequest = LocationRequest.create();

        // Konum kontrol aralıkları (GPS çipinin uyanma süresi)
        locationRequest.setInterval(20000); // Normalde 20 saniyede bir fırsat kolla
        locationRequest.setFastestInterval(10000); // Sen çok hızlı gitsen bile en fazla 10 saniyede bir gönder
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);

        // 🔋 İŞTE PİLİ KURTARAN O SİHİRLİ KOD:
        // Telefon fiziki olarak 15 metre yer değiştirmedikçe yukarıdaki süreler dolsa bile sunucuya veri gönderme!
        locationRequest.setSmallestDisplacement(15.0f);

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                for (Location location : locationResult.getLocations()) {
                    sendLocationToServer(location);
                }
            }
        };
        fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
    }

    private void sendLocationToServer(Location location) {
        new Thread(() -> {
            try {
                URL url = new URL("https://bizim-dunyamiz.onrender.com/api/locations");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setDoOutput(true);

                String speed = String.format(java.util.Locale.US, "%.1f", (location.getSpeed() * 3.6));
                String jsonParam = "{\"user\":\"" + CURRENT_USER + "\", \"lat\":" + location.getLatitude() + ", \"lng\":" + location.getLongitude() + ", \"speed\":\"" + speed + "\"}";

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonParam.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }
                Log.d("Tracker", "Native Konum Gönderildi! Kodu: " + conn.getResponseCode());
                conn.disconnect();
            } catch (Exception e) {
                Log.e("Tracker", "Hata: " + e.getMessage());
            }
        }).start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY; // Android sistemi öldürürse inatla tekrar diriltmeye çalışır
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}