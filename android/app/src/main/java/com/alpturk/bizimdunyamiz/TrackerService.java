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
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import android.content.SharedPreferences;

public class TrackerService extends Service implements SensorEventListener {
    private FusedLocationProviderClient fusedLocationClient;
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private long lastShakeTime = 0;

    private Handler handler;
    private Runnable locationRunnable;
    private long currentInterval = 120000; // Başlangıöta sabitken 2 dakika

    private String getCurrentUser() {
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        return prefs.getString("username", "anonim");
    }

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
        startSingleShotLoop();
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

    private void startSingleShotLoop() {
        handler = new Handler(Looper.getMainLooper());
        locationRunnable = new Runnable() {
            @Override
            public void run() {
                fetchSingleLocation();
                handler.postDelayed(this, currentInterval);
            }
        };
        handler.post(locationRunnable);
    }

    @SuppressLint("MissingPermission")
    private void fetchSingleLocation() {
        // ÖNCE TAZE KONUM İSTE (Gerçek zamanlı hız ve yer için)
        CancellationTokenSource cancellationTokenSource = new CancellationTokenSource();
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellationTokenSource.getToken())
                .addOnSuccessListener(location -> {
                    if (location != null) {
                        processAndSendLocation(location);
                    } else {
                        // YEDEK PLAN: Kapalı alanda GPS çekmezse (null dönerse) son bilinen konumu al
                        fusedLocationClient.getLastLocation().addOnSuccessListener(lastLoc -> {
                            if (lastLoc != null) {
                                processAndSendLocation(lastLoc);
                            }
                        });
                    }
                });
    }

    // Hem taze hem yedek konum için süreyi ayarlayan ortak yardımcı fonksiyon
    private void processAndSendLocation(Location location) {
        sendLocationToServer(location);

        float speedKmh = location.getSpeed() * 3.6f;
        if (speedKmh > 3.0f) {
            currentInterval = 10000; // Hareketliyken 10 sn
        } else {
            currentInterval = 120000; // Sabitken 2 dk
        }
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

                String activeUser = getCurrentUser();
                String jsonParam = "{\"user\":\"" + activeUser + "\", \"lat\":" + location.getLatitude() + ", \"lng\":" + location.getLongitude() + ", \"speed\":\"" + speed + "\", \"battery\":" + battery + "}";

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
                String activeUser = getCurrentUser();
                String jsonParam = "{\"user\":\"" + activeUser + "\"}";
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