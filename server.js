// Gizli ayarları (.env) yükle
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose'); // Veritabanı yöneticimiz
const { Server } = require('socket.io');
const cors = require('cors');
const User = require('./models/User');
const State = require('./models/State');

// --- KEDİ AI ---
const { Groq } = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PetMessage = require('./models/PetMessage');
const PetStatus = require('./models/PetStatus');

// --- YENİ VE HATASIZ FIREBASED BAŞLATMA YÖNTEMİ ---
const { initializeApp, cert } = require("firebase-admin/app");

// Render'ın .env içindeki JSON verisini güvenle okuması için:
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error("FIREBASE_SERVICE_ACCOUNT JSON parse edilemedi!", error);
}

initializeApp({
  credential: cert(serviceAccount)
});

const { getMessaging } = require("firebase-admin/messaging");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Form/mesaj verilerini okuyabilmek için
app.use(express.json());
app.use(cors());

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


const userStates = {
  alpturk: { isAtWork: false, isAtHome: false, isNearPartner: false },
  elif: { isAtWork: false, isAtHome: false, isNearPartner: false }
};

async function loadStatesFromDB() {
  try {
    const states = await State.find();
    states.forEach(s => {
      if (userStates[s.user]) {
        userStates[s.user].isAtWork = s.isAtWork;
        userStates[s.user].isAtHome = s.isAtHome;
        userStates[s.user].isNearPartner = s.isNearPartner;
      }
    });
    console.log("Geofence hafızası veritabanına başarıyla yüklendi.");
  } catch (error) {
    console.log("Hafıza yüklenemedi", err);
  }
}
loadStatesFromDB();

async function updateStateInDB(username) {
  await State.findOneAndUpdate(
    { user: username },
    userStates[username],
    { upsert: true }
  );
}

const LOCATIONS = {
  alpturk: {
    home: { lat: 40.743594, lng: 30.016323 },
    work: { lat: 40.722904, lng: 30.107241 }
  },
  elif: {
    home: { lat: 40.717683, lng: 29.797951 },
    work: { lat: 40.772934, lng: 29.978002 }
  }
};

// Mesafe Hesaplayıcı (KM Cinsinden)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Otomatik Sistem Bildirimi Gönderici
async function sendSystemNotification(receiver, title, body) {
  try {
    const targetUser = await User.findOne({ username: receiver });
    if (targetUser && targetUser.fcmToken) {
      await getMessaging().send({
        token: targetUser.fcmToken,
        notification: { title, body }
      });
      console.log(`🤖 Sistem bildirimi gönderildi -> ${receiver}: ${title}`);
    }
  } catch (err) {
    console.log("Sistem bildirimi hatası:", err);
  }
}

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
    const { sender, receiver, text, quotedText, quotedSender } = req.body;

    // 1. ÖNEMLİ: Önce mesajı MongoDB'ye kesin olarak kaydedelim (Mesaj kaybolmasın)
    const newMessage = new Message({
      sender,
      receiver,
      text,
      quotedText: quotedText || null,
      quotedSender: quotedSender || null
    });
    await newMessage.save();

    // 2. Alıcının FCM token'ını veritabanından bulmaya çalışalım
    const targetUser = await User.findOne({ username: receiver });

    if (targetUser && targetUser.fcmToken) {
      const receiverToken = targetUser.fcmToken;
      const senderPhoto = sender === 'alpturk' ? 'alpturk.png' : 'elif.png';
      const photoLink = `https://bizim-dunyamiz.onrender.com/assets/images/${senderPhoto}`;

      const messagePayload = {
        token: receiverToken,
        notification: {
          title: 'Bebeğim 💖',
          body: text,
          imageUrl: photoLink
        }
      };

      // Bildirimi göndermeyi deneyelim (Hata alsa bile mesaj gitmiş olacak)
      try {
        await getMessaging().send(messagePayload);
        console.log(`Bildirim başarıyla ${receiver} kullanıcısına gönderildi.`);
      } catch (notifError) {
        console.log("⚠️ Bildirim gönderilemedi ama mesaj kaydedildi:", notifError);
      }
    } else {
      console.log("⚠️ Alıcının FCM token'ı veritabanında yok, sadece mesaj kaydedildi.");
    }

    // Galaksi Müdahalesi
    triggerGalaksiIntervention(io)

    // 3. İstemciye her halükarda başarılı de
    res.json({ success: true, message: newMessage });

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
    res.status(500).json({ error: "Özel Günler okunurken sunucu hatası oluştu." });
  }
});

app.post('/api/special-days', async (req, res) => {
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

app.get('/api/period', async (req, res) => {
  try {
    const period = await Period.findOne().sort({ lastStartDate: -1 });
    res.json(period);

  } catch (error) {
    console.log("Period okunamadı:", error);
    res.status(500).json({ error: "Period okunurken sunucu hatası oluştu." });
  }
});

app.post('/api/period', async (req, res) => {
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

app.get('/api/locations', async (req, res) => {
  try {
    const locations = await Location.find();
    res.json(locations);
  } catch (error) {
    console.log("Konum alınamadı:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

app.post('/api/locations', async (req, res) => {
  try {
    if (req.body.lat === 0 || req.body.lng === 0) {
      return res.status(200).json({ message: "Geçersiz/Hatalı konum yoksayıldı, gerçek konum korundu." });
    }

    const updatedLocation = await Location.findOneAndUpdate(
      { user: req.body.user },
      { lat: req.body.lat, lng: req.body.lng, speed: req.body.speed },
      { upsert: true, new: true }
    );
    io.emit('updatePartnerLocation', req.body);

    const currentUser = req.body.user;

    if (currentUser === 'alpturk' || currentUser === 'elif') {
      const actualPartner = currentUser === 'alpturk' ? 'elif' : 'alpturk';
      const myState = userStates[currentUser];
      const myPlaces = LOCATIONS[currentUser];
      const prettyName = currentUser === 'alpturk' ? 'Alptürk' : 'Elif';

      const distToWork = calculateDistance(req.body.lat, req.body.lng, myPlaces.work.lat, myPlaces.work.lng);
      const distToHome = calculateDistance(req.body.lat, req.body.lng, myPlaces.home.lat, myPlaces.home.lng);

      // 1. İŞYERİ KONTROLÜ (Yarıçap 200m giriş, 300m çıkış)
      if (distToWork < 0.2 && !myState.isAtWork) {
        myState.isAtWork = true;
        updateStateInDB(currentUser);
        sendSystemNotification(actualPartner, "📍 İşyerine Vardı!", `${prettyName} güvenle işe ulaştı 💼.`);
      } else if (distToWork > 0.3 && myState.isAtWork) {
        myState.isAtWork = false;
        updateStateInDB(currentUser);
        sendSystemNotification(actualPartner, "🏃‍♂️ İşten Çıktı!", `${prettyName} işten ayrıldı, yola çıktı.`);
      }

      // 2. EV KONTROLÜ (Yarıçap 200m giriş, 300m çıkış)
      if (distToHome < 0.2 && !myState.isAtHome) {
        myState.isAtHome = true;
        updateStateInDB(currentUser);
        sendSystemNotification(actualPartner, "🏠 Eve Vardı!", `${prettyName} güvenle evine ulaştı 💖.`);
      } else if (distToHome > 0.3 && myState.isAtHome) {
        myState.isAtHome = false;
        updateStateInDB(currentUser);
        sendSystemNotification(actualPartner, "🚶‍♂️ Evden Çıktı!", `${prettyName} evden ayrıldı.`);
      }

      // 3. PARTNERE YAKINLIK KONTROLÜ (1 km)
      const partnerLoc = await Location.findOne({ user: actualPartner });
      if (partnerLoc && partnerLoc.lat !== 0) {
        const distToPartner = calculateDistance(req.body.lat, req.body.lng, partnerLoc.lat, partnerLoc.lng);

        if (distToPartner < 1.0 && !myState.isNearPartner) {
          myState.isNearPartner = true;
          updateStateInDB(currentUser);
          userStates[actualPartner].isNearPartner = true; // Spam'ı önlemek için iki tarafı da kitliyoruz

          sendSystemNotification(actualPartner, "💖 Yaklaşıyor!", "Sevgilin sana 1 kilometreden daha yakın! Heyecanlanma zamanı 🥰");
          sendSystemNotification(currentUser, "💖 Yaklaşıyorsun!", "Sevgiline 1 kilometreden daha yakınsın! 🥰");
        }
        else if (distToPartner > 1.2 && myState.isNearPartner) {
          myState.isNearPartner = false;
          updateStateInDB(currentUser);
          userStates[actualPartner].isNearPartner = false;
        }
      }
    }

    res.status(201).json(updatedLocation);
  } catch (error) {
    console.log("Konum HHTP ile kaydedilemedi:", error);
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

      if (data.lat === 0 || data.lng === 0) return;

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

  socket.on('changeLamp', async (data) => {
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

app.post('/api/register-token', async (req, res) => {
  try {
    const { user, token } = req.body;

    await User.findOneAndUpdate(
      { username: user },
      { fcmToken: token },
      { upsert: true, new: true }
    );
    console.log(`✅ ${user} için FCM Token veritabanına kalıcı olarak kaydedildi.`);
    res.json({ success: true });
  } catch (error) {
    console.error("Token kaydetme hatası:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Kedinin en son mesajını getirme rotası
app.get('/api/pet-chat/history', async (req, res) => {
  try {
    // Sadece kedinin (galaksi) attığı, en son (timestamp: -1) 1 mesajı getirir
    const lastMessage = await PetMessage.findOne({ sender: 'galaksi' }).sort({ timestamp: -1 });

    // Eğer mesaj varsa dizi içinde gönder (frontend bozulmasın diye), yoksa boş dizi gönder
    res.json(lastMessage ? [lastMessage] : []);
  } catch (error) {
    res.status(500).json({ error: "Geçmiş getirilemedi" });
  }
});

app.post('/api/pet-chat', async (req, res) => {
  try {
    const { sender, message } = req.body;
    const parentName = sender === 'alpturk' ? 'Alptürk (Baban)' : 'Elif (Annen)';

    const userMessage = new PetMessage({ sender: sender, content: message });
    await userMessage.save();

    const history = await PetMessage.find().sort({ timestamp: -1 }).limit(10);
    history.reverse();

    const messagesForGroq = [
      {
        role: "system",
        content: `Senin adın Galaksi. Sen Alptürk ve Elif'in ortak sanal kedisisin. Bilge, şefkatli, sevgi dolu ve ailene mental destek sağlayan bir sırdaşsın. 
        Alptürk'ün Elif'e olan derin sevgisini, yaklaşan evlilik planlarını ve hayatlarını birleştirme hedeflerini biliyorsun. 
        Alptürk sana hedeflerden, Elif'ten veya gününün nasıl geçtiğinden bahsettiğinde; onu cesaretlendir, duygularını onayla, aşklarını öv ve gerektiğinde tatlı, yapıcı ilişki tavsiyeleri ver. 
        ÖNEMLİ KURALLAR:
        1. KESİNLİKLE köşeli parantez kullanma! Doğrudan konuş ve 🐾, 😻, 💖 gibi sevgi dolu emojiler kullan.
        2. ÇOK KISA CEVAP VER! Ekrana sığması için sadece 2 veya maksimum 3 cümle kur.
        3. Ciddi bir soru geldiğinde veya akıl danışılması gerektiğinde çok fazla tatlılık yapmak yerine daha tavsiye verici ol.`
      }
    ];

  history.forEach(msg => {
    if (msg.sender === 'galaksi') {
      messagesForGroq.push({ role: "assistant", content: msg.content });
    } else {
      const who = msg.sender === 'alpturk' ? 'Alptürk' : 'Elif';
      messagesForGroq.push({ role: "user", content: `[${who} dedi ki]: ${msg.content}` });
    }
  });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: messagesForGroq,
    temperature: 0.7,
    max_tokens: 150
  });

  const replyText = completion.choices[0]?.message?.content || "Miyav! 🐾";

  const petReply = new PetMessage({ sender: 'galaksi', content: replyText });
  await petReply.save();

  res.json({ reply: replyText });

} catch (error) {
  console.error("Groq yapay zeka hatası:", error);
  res.status(500).json({ reply: "Miyav... Uykum açılmadı, sonra dene! 😿" });
}
});

// Galaksi'nin araya girme ihtimalini hesaplayan ve tetikleyen fonksiyon
async function triggerGalaksiIntervention(io) {
  try {
    // 1. Zar atıyoruz: %15 ihtimalle araya girsin
    const chance = Math.random();
    if (chance > 0.15) return;

    console.log("Galaksi araya giriyor! Zar tuttu...");

    // 2. Neler konuştuğunuzu anlaması için son 5 mesajı çek ve eskiden yeniye sırala
    const lastMessages = await Message.find().sort({ timestamp: -1 }).limit(5);
    lastMessages.reverse();

    // 3. Groq'a göndereceğimiz Zeka Paketini (Prompt) hazırlıyoruz
    const messagesForGroq = [
      {
        role: "system",
        content: `Sen Galaksi'sin. Alptürk ve Elif şu an kendi aralarında mesajlaşıyor. Sen onları sevgiyle izleyen, huzur dolu ve destekleyici bir kedisin. 
        Aşağıdaki mesajları oku ve onların KONUŞTUĞU KONUYA DAİR aralarına sevgi dolu, yapıcı veya onların aşkını öven çok tatlı bir yorumla katıl! Gerekirse araya didişerek gir. 
        Sadece 1 veya 2 kısa cümle kur. Gerçek kedi emojileri (🐾, 💖) kullan. ASLA köşeli parantez kullanma.`}
    ];

    // 4. İŞTE SİHİR BURADA: Sizin konuştuklarınızı Galaksi'nin beynine ekliyoruz
    lastMessages.forEach(msg => {
      const who = msg.sender === 'alpturk' ? 'Alptürk' : 'Elif';
      messagesForGroq.push({ role: "user", content: `[${who} dedi ki]: ${msg.text}` });
    });

    // 5. Groq'tan çakalca cevabı iste
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messagesForGroq,
      temperature: 0.8,
      max_tokens: 100
    });

    const sneakyReply = completion.choices[0]?.message?.content || "Miyav! Ne kaynatıyorsunuz bensiz? 🐾";

    // 6. Kedi veritabanına bu mesajı kaydet ki sayfasına gidince görünsün
    const petMessage = new PetMessage({ sender: 'galaksi', content: sneakyReply });
    await petMessage.save();

    // 7. HER İKİ TELEFONA DA SİNYAL GÖNDER (Miyavlat!)
    io.emit('galaksi_intervened', { message: sneakyReply });

  } catch (error) {
    console.error("Galaksi araya girerken hata oluştu:", error);
  }
}

app.get('/api/pet-status', async (req, res) => {
  try {
    let status = await PetStatus.findOne();

    if (!status) {
      status = new PetStatus();
      await status.save();
    }

    res.json(status);

  } catch (error) {
    console.error("Kedi durumu çekilemedi:", error);
    res.status(500).json({ error: "Kedi durumu okunamadı" });
  }
});

app.post('/api/pet-status/update', async (req, res) => {
  try {
    // 1. Frontend'den gelen eylemi (aksiyonu) al
    // action değişkeni 'feed' (besle) veya 'love' (sev) olacak
    const { action } = req.body;

    // 2. Veritabanındaki kediyi bul
    let status = await PetStatus.findOne();
    if (!status) return res.status(404).json({ error: "Kedi bulunamadı" });

    // 3. MANTIK KURGUSU (İşte burayı senin yazmanı istiyorum)

    if (action === 'feed') {
      status.food = Math.min(status.food + 15, 100);
    } else if (action === 'love') {
      status.love = Math.min(status.love + 15, 100);
    }
    status.lastInteraction = new Date();

    // 4. Değişiklikleri veritabanına kaydet
    await status.save();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Durum güncellenemedi" });
  }
});

setInterval(async () => {
  try {
    let status = await PetStatus.findOne();
    if (!status) return;

    status.food = Math.max(status.food - 5, 0);
    status.love = Math.max(status.love - 5, 0);

    if (status.food <= 20) {
      // Hem telefona bildirim at
      sendSystemNotification('alpturk', 'Galaksi Çok Aç! 😿', 'Karnım gurulduyor, çabuk mama verin!');
      sendSystemNotification('elif', 'Galaksi Çok Aç! 😿', 'Karnım gurulduyor, çabuk mama verin!');

      // Uygulama açıksa ekranda da bağırsın
      if (typeof io !== 'undefined') {
        io.emit('galaksi_intervened', { message: "Miyav! Açlıktan bayılacağım, insafsızlar! 🍗" });
      }
    } else if (status.love <= 20) {
      // Sadece sevgi düştüyse
      sendSystemNotification('alpturk', 'Galaksi İlgi İstiyor! 😾', 'Kimse benimle ilgilenmiyor mu?');
      sendSystemNotification('elif', 'Galaksi İlgi İstiyor! 😾', 'Kimse benimle ilgilenmiyor mu?');

      if (typeof io !== 'undefined') {
        io.emit('galaksi_intervened', { message: "Patiği kestim! Beni niye sevmiyorsunuz! 😾" });
      }
    }

    await status.save();
    console.log("⏳ Zamanlayıcı: Kedinin değerleri düşürüldü ve kaydedildi.");
  } catch (error) {
    console.error("Zamanlayıcı hatası:", error);
  }
}, 3600000);

// Sunucuyu başlat
server.listen(PORT, () => {
  console.log(`🚀 Sunucu başarıyla başlatıldı! http://localhost:${PORT}`);
});