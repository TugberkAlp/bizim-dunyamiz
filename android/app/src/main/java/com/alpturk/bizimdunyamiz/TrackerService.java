package com.alpturk.bizimdunyamiz;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
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
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class TrackerService extends Service implements SensorEventListener {
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private long lastShakeTime = 0;

    private final String CURRENT_USER = "alpturk"; // Elif için "elif" yapılacak

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);

        // Sallama sensörünü (Accelerometer) başlat
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensorManager != null) {
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accelerometer != null) {
                sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL);
            }
        }

        createNotificationChannel();
        startForeground(1, getNotification());
        requestLocationUpdates();
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
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .build();
    }

    @SuppressLint("MissingPermission")
    private void requestLocationUpdates() {
        LocationRequest locationRequest = LocationRequest.create();

        locationRequest.setInterval(15000);        // Normalde 15 saniye
        locationRequest.setFastestInterval(10000);   // En hızlı 10 saniye
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY); // Hassas konum (Motor/Araç için önemli)

        // SİHİRLİ KURAL: En az 15 metre yer değiştirdiğinde tetiklenir.
        // Sabit dururken yerinde saydığı için pil harcamaz, hareket edince 15 saniyede bir akmaya başlar.
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

    // 🔋 Pil Yüzdesini Okuma Fonksiyonu
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

                String speed = String.format(java.util.Locale.US, "%.1f", (location.getSpeed() * 3.6));
                int battery = getBatteryLevel();

                String jsonParam = "{\"user\":\"" + CURRENT_USER + "\", \"lat\":" + location.getLatitude() + ", \"lng\":" + location.getLongitude() + ", \"speed\":\"" + speed + "\", \"battery\":" + battery + "}";

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonParam.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e("Tracker", "Hata: " + e.getMessage());
            }
        }).start();
    }

    // 👋 Sallama (Shake-to-Send) Sensör Olayları
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

            if (gForce > 2.7) { // Ciddi bir sallama algılandığında
                long currentTime = System.currentTimeMillis();
                if (currentTime - lastShakeTime > 5000) { // Üst üste tetiklenmesin diye 5 saniye kuralı
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
                String jsonParam = "{\"user\":\"" + CURRENT_USER + "\"}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonParam.getBytes(StandardCharsets.UTF_8));
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e("Tracker", "Shake Hata: " + e.getMessage());
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
    }
}