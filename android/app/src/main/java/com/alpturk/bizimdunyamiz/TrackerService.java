package com.alpturk.bizimdunyamiz;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.os.BatteryManager;
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
import com.google.android.gms.location.Priority;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class TrackerService extends Service implements SensorEventListener {
    private FusedLocationProviderClient fusedLocationClient;
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private long lastShakeTime = 0;

    private Location lastSentLocation;

    // Döngü yerine Android'in kendi konum dinleyicisini kullanıyoruz
    private LocationCallback locationCallback;
    private long lastUploadTime = 0;

    private String getCurrentUser() {
        SharedPreferences prefs = getSharedPreferences("BizimAyarlar", MODE_PRIVATE);
        return prefs.getString("aktif_kullanici", "bilinmeyen_kullanici");
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);

        // Sallama sensörünü başlat
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager != null) {
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accelerometer != null) {
                sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
            }
        }

        createNotificationChannel();
        startForeground(1, getNotification());

        // Uykuya dalmayan, harekete duyarlı konum dinleyicisini başlat
        startLocationUpdates();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("TrackerChannel", "Canlı Takip", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification getNotification() {
        return new NotificationCompat.Builder(this, "TrackerChannel")
                .setContentTitle("Bizim Dünyamız")
                .setContentText("Arka plan koruması aktif 💖")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation) // Kendi ikonun varsa değiştirebilirsin
                .build();
    }

    @SuppressLint("MissingPermission")
    private void startLocationUpdates() {
        Log.d("TrackerService", "🚀 Harekete duyarlı konum dinleyicisi (LocationCallback) başlatılıyor...");

        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
                .setMinUpdateDistanceMeters(5) // 5 metre yer değiştiğinde tetikle
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;

                for (Location location : locationResult.getLocations()) {
                    long currentTime = System.currentTimeMillis();
                    float speedKmh = location.getSpeed() * 3.6f;

                    // Mesafe Farkını Hesapla (Eğer önceki konum varsa)
                    float distance = 0;
                    if (lastSentLocation != null) {
                        distance = lastSentLocation.distanceTo(location);
                    }

                    // Şart 1: Hız 3 km/s'den büyükse (Hareketliyse)
                    // Şart 2: Mesafe 10 metreden fazla değişmişse (Emülatör ışınlanması veya hızın 0 görünmesi hatası)
                    // Şart 3: 2 dakika (120000 ms) geçmişse (Sabit duruyor ama periyodik güncelleme)

                    if (speedKmh > 3.0f || distance > 10.0f || (currentTime - lastUploadTime > 120000)) {
                        lastUploadTime = currentTime;
                        lastSentLocation = location; // Son gönderilen konumu hafızaya al

                        Log.d("TrackerService", "📡 GÖNDERİLİYOR -> Hız: " + speedKmh + " | Mesafe Farkı: " + distance + " metre");
                        sendLocationToServer(location);
                    } else {
                        Log.d("TrackerService", "💤 Bekliyor (Hız ve Mesafe düşük, 2 dakika dolmadı). Mesafe farkı: " + distance + "m");
                    }
                }
            }
        };

        fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
    }

    // Pil Yüzdesini Okuma Fonksiyonu
    private int getBatteryLevel() {
        BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
        if (bm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        }
        return 100;
    }

    private void sendLocationToServer(Location location) {
        new Thread(() -> {
            try {
                URL url = new URL("https://bizim-dunyamiz.onrender.com/api/locations");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setDoOutput(true);

                // Hız değerindeki virgül/nokta karışıklığını kesin olarak engelle! (Çok önemli)
                String speed = String.format(java.util.Locale.US, "%.1f", (location.getSpeed() * 3.6));

                // Enlem ve Boylam için de aynı Amerikan formatını kullanalım (Virgül hatası olmasın)
                String latStr = String.format(java.util.Locale.US, "%.6f", location.getLatitude());
                String lngStr = String.format(java.util.Locale.US, "%.6f", location.getLongitude());

                int battery = getBatteryLevel();
                String activeUser = getCurrentUser();

                // JSON'ı oluştur
                String jsonParam = "{\"user\":\"" + activeUser + "\", \"lat\":" + latStr + ", \"lng\":" + lngStr + ", \"speed\":\"" + speed + "\", \"battery\":" + battery + "}";
                Log.d("TrackerService", "🚀 SUNUCUYA GİDEN JSON: " + jsonParam);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonParam.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                // SUNUCUNUN CEVABINI OKU
                int responseCode = conn.getResponseCode();
                if (responseCode == HttpURLConnection.HTTP_OK || responseCode == HttpURLConnection.HTTP_CREATED) {
                    Log.d("TrackerService", "✅ SUNUCU ONAYLADI: Veri başarıyla kaydedildi.");
                } else {
                    Log.e("TrackerService", "❌ SUNUCU REDDETTİ: Hata Kodu: " + responseCode);
                }

                conn.disconnect();
            } catch (Exception e) {
                Log.e("TrackerService", "🔥 AĞ HATASI (Bağlantı kurulamadı): " + e.getMessage());
            }
        }).start();
    }

    // Sallama (Shake-to-Send) Sensör Olayları
    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            float x = event.values[0];
            float y = event.values[1];
            float z = event.values[2];

            float gX = x / SensorManager.GRAVITY_EARTH;
            float gY = y / SensorManager.GRAVITY_EARTH;
            float gZ = z / SensorManager.GRAVITY_EARTH;

            // Sallama şiddeti formülü
            float gForce = (float) Math.sqrt(gX * gX + gY * gY + gZ * gZ);

            if (gForce > 2.7) {
                long currentTime = System.currentTimeMillis();
                if (currentTime - lastShakeTime > 5000) {
                    lastShakeTime = currentTime;
                    sendShakeSignalToServer();
                }
            }
        }
    }

    private void sendShakeSignalToServer() {
        new Thread(() -> {
            try {
                URL url = new URL("https://bizim-dunyamiz.onrender.com/api/shake");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setDoOutput(true);
                String activeUser = getCurrentUser();
                String jsonParam = "{\"user\":\"" + activeUser + "\"}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonParam.getBytes(StandardCharsets.UTF_8));
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e("TrackerService", "Shake Hata: " + e.getMessage());
            }
        }).start();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        // Servis kapatılırsa konum dinlemeyi de durdur
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }
    }
}