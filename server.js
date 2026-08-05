// Gizli ayarları (.env) yükle
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose'); // Veritabanı yöneticimiz
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Form/mesaj verilerini okuyabilmek için
app.use(express.json());

// --- DEDEKTİF KODLARI ---
console.log("🔍 Veritabanı linki kontrol ediliyor...");
if (process.env.MONGODB_URI) {
    console.log("✅ Link bulundu! Bağlantı deneniyor...");
} else {
    console.log("❌ HATA: .env dosyası içindeki MONGODB_URI okunamadı!");
}

// Ekstra Dedektif: Mongoose'un her adımını izleyelim
mongoose.connection.on('connecting', () => console.log('⏳ Mongoose sunucuya ulaşmaya çalışıyor...'));
mongoose.connection.on('error', (err) => console.log('❌ Mongoose arka plan hatası:', err.message));

// MongoDB Veritabanına Bağlanma İşlemi (5 saniye süre sınırı ekledik)
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('✅ MongoDB Veritabanına Başarıyla Bağlanıldı!'))
    .catch((err) => console.log('❌ MongoDB Bağlantı Hatası:', err.message));

// --- API ROTALARI ---
const Message = require('./models/Message')

app.get('/api/messages', async (req, res) => {
  try {
    const mesajlar = await Message.find().sort({ timestamp: 1 });
    res.json(mesajlar);
  } catch (error) {
    console.log("Mesajlar okunamadı:", error);
    res.status(500).json({ error: "Mesajlar okunurken sunucu hatası oluştu." });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const yeniMesaj = new Message({
      sender: req.body.sender,
      text: req.body.text
    });

    await yeniMesaj.save();

    res.status(201).json(yeniMesaj);
  } catch (error) {
    console.log("Mesaj kaydedilemedi:", error);
    res.status(500).json({ error: "Mesaj kaydedilirken sunucu hatası oluştu." });
  }
});

const SpecialDay = require('./models/SpecialDay');

app.get('/api/special-days', async (req, res) => {
  try {
    const specialDays = await SpecialDay.find().sort({ date: 1 });
    res.json(specialDays);
  } catch (error) {
    console.log("Özel Günler okunamadı:", error);
    res.status(500).json({ error: "Özel Günler okunurken sunucu hatası oluştu."});
  }
});

app.post('/api/special-days', async(req, res) => {
  try {
    const yeniSpecialDays = new SpecialDay({
      title: req.body.title,
      date: req.body.date,
      icon: req.body.icon,
      color: req.body.color,
      dateFormat: req.body.dateFormat
    });

    await yeniSpecialDays.save();

    res.status(201).json(yeniSpecialDays);
  } catch (error) {
    console.log("Özel Gün kaydedilemedi:", error);
    res.status(500).json({ error: "Özel Gün kaydedilirken sunucu hatası oluştu." });
  }
});

const Period = require('./models/Period');

app.get('/api/period', async(req, res) => {
  try {
    const period = await Period.findOne().sort({ lastStartDate: -1 });
    res.json(period);

  } catch (error) {
    console.log("Period okunamadı:", error);
    res.status(500).json({ error: "Period okunurken sunucu hatası oluştu."});
  }
});

app.post('/api/period', async(req, res) => {
  try {
    const yeniPeriod = new Period({
      lastStartDate: req.body.lastStartDate,
      note: req.body.note
    });

    await yeniPeriod.save();

    res.status(201).json(yeniPeriod);
  } catch (error) {
    console.log("Period kaydedilemedi:", error);
    res.status(500).json({ error: "Period kaydedilirken sunucu hatası oluştu." });
  }
});

const Lamp = require('./models/Lamp');

app.get('/api/lamps', async (req, res) => {
  try {
    const lamps = await Lamp.find();
    res.json(lamps);
  } catch (error) {
    console.log("Lambalar okunamadı:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

const Location = require('./models/Location');

app.get('/api/locations', async(req, res) => {
  try {
    const locations = await Location.find();
    res.json(locations);
  } catch (error) {
    console.log("Konum alınamadı:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Frontend dosyalarımızı dışarıya açıyoruz
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Yeni bir cihaz bağlandı! Cihaz ID:', socket.id);

  socket.on('sendLocation', async (data) => {
    try {
      await Location.findOneAndUpdate(
        { user: data.user },
        { lat: data.lat, lng: data.lng, speed: data.speed },
        { upsert: true, new: true }
      );

      socket.broadcast.emit('updatePartnerLocation', data);
    } catch (error) {
      console.log("Konum güncellenirken hata oluştu:", error);
    }
  });

  socket.on('chatMessageSent', () => {
    socket.broadcast.emit('refreshMessages');
  });

  socket.on('changeLamp', async(data) => {
    try {
      await Lamp.findOneAndUpdate(
        { user: data.user },
        { mood: data.mood, color: data.color },
        { upsert: true, new: true }
      );

      socket.broadcast.emit('updateLampColor', data);
    } catch (err) {
      console.log("Lamba güncellenirken hata:", err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Bir cihaz ayrıldı:', socket.id);
  });
});

// Sunucuyu başlat
server.listen(PORT, () => {
    console.log(`🚀 Sunucu başarıyla başlatıldı! http://localhost:${PORT}`);
});