// UYGULAMA AYARLARI

const SERVER_URL = "https://bizim-dunyamiz.onrender.com";

// Capacitor global objesinden eklentiyi alıyoruz (sadece telefondayken çalışır)
const BackgroundGeolocation = window.Capacitor ? window.Capacitor.Plugins.BackgroundGeolocation : null;

const socket = io(SERVER_URL);
let currentUser = localStorage.getItem('user');

let periodData = {
  lastStartDate: "2026-07-10",
  duration: 7,
  cycleLength: 28
};

let partnerLocation = { lat: 0, lng: 0, speed: "0.0" };
// HARİTA DEĞİŞKENLERİ
let map = null;
let myMarker = null;
let partnerMarker = null;

const photoAlpturk = 'assets/images/alpturk.png';
const photoElif = 'assets/images/elif.png';

let myPhoto = currentUser === 'alpturk' ? photoAlpturk : photoElif;
let partnerPhoto = currentUser === 'alpturk' ? photoElif : photoAlpturk;

const alpturkHomeCoords = [40.7434, 30.0168];
const elifHomeCoords = [40.7177, 29.7979];

const homeIcon = L.divIcon({
  className: 'custom-icon-wrapper',
  html: `<div class="fixed-home-pin"><i class="fa-solid fa-house"></i></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

let lampStates = {
  elif: { mood: 'duygusal', color: '#d28fb0' },
  alpturk: { mood: 'mutlu', color: '#e5cd85' }
};

document.addEventListener("DOMContentLoaded", () => {

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    updateThemeIcon(true);
  }
  if (!currentUser) {
    document.getElementById('login-screen').style.display = 'flex';
  } else {
    document.getElementById('login-screen').style.display = 'none';

    updateGreeting();
    loadSpecialDays();
    loadPeriodData();
    updateLiveDistance();
    loadMessages();
    loadLamps();
    loadLocations();

    applyMoodToElement(document.getElementById('elif-lamp'), lampStates.elif.color);
    applyMoodToElement(document.getElementById('alpturk-lamp'), lampStates.alpturk.color);
  }
});

const messageInput = document.getElementById('message-input');

function loginAs(selectedUser) {
  localStorage.setItem('user', selectedUser);

  window.location.reload();
}

let specialDays = [];

let currentLampElement = null;

function selectMood(element, mood) {
  const isAlpturksLamp = element.classList.contains('right-light');
  const isElifsLamp = element.classList.contains('left-light');

  // Eğer KENDİ lambana tıklıyorsan mod değiştirme penceresini aç
  if ((currentUser === 'alpturk' && isAlpturksLamp) || (currentUser === 'elif' && isElifsLamp)) {
    currentLampElement = element;
    document.getElementById('mood-modal').style.display = 'flex';
  }
  // Eğer başkasının lambasına tıklıyorsan duygu durumunu göster
  else {
    const owner = isElifsLamp ? "Elif" : "Alptürk";
    const moodInfo = isElifsLamp ? lampStates.elif : lampStates.alpturk;
    alert(`${owner} şu anda ${moodInfo.mood} hissediyor. ✨`);
  }
}

async function loadLamps() {
  try {
    const response = await fetch(SERVER_URL + '/api/lamps');
    const data = await response.json();

    data.forEach(lamp => {
      lampStates[lamp.user] = { mood: lamp.mood, color: lamp.color };
      const lampElement = document.getElementById(lamp.user + '-lamp');
      if (lampElement) {
        applyMoodToElement(lampElement, lamp.color);
      }
    });
  } catch (error) {
    console.log("Lambalar yüklenemedi:", error);
  }
}

function closeMoodModal() {
  document.getElementById('mood-modal').style.display = 'none';
}

// Seçilen modu uygular
function applyMood(mood, color) {
  if (currentLampElement) {
    const isElifsLamp = currentLampElement.classList.contains('left-light');
    const owner = isElifsLamp ? 'elif' : 'alpturk';

    // 1. Durumu hafızaya kaydet
    lampStates[owner] = { mood: mood, color: color };
    applyMoodToElement(currentLampElement, color);

    socket.emit('changeLamp', {
      user: owner,
      mood: mood,
      color: color
    });
  }
  closeMoodModal();
}

function applyMoodToElement(element, color) {
  const lamp = element.querySelector('.lamp');
  const beam = element.querySelector('.beam');
  lamp.style.backgroundColor = color;
  beam.style.background = `linear-gradient(to bottom, ${color}40 0%, transparent 100%)`;
}

function switchTab(tabName, element) {
  const pages = document.querySelectorAll('.content');
  pages.forEach(page => page.style.display = 'none');

  if (tabName === 'home') {
    document.getElementById('home-page').style.display = 'block';
  } else if (tabName === 'calendar') {
    document.getElementById('calendar-page').style.display = 'block';
  } else if (tabName === 'notes') {
    document.getElementById('notes-page').style.display = 'flex';
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }
}

function calculateRemainingDays(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDate = new Date(dateString);
  const eventMonth = eventDate.getMonth();
  const eventDay = eventDate.getDate();

  let nextEventDate = new Date(today.getFullYear(), eventMonth, eventDay);

  if (today > nextEventDate) {
    nextEventDate.setFullYear(today.getFullYear() + 1);
  }

  const diffTime = nextEventDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

async function loadSpecialDays() {
  const specialDaysContainer = document.getElementById('special-days-container');

  specialDaysContainer.innerHTML = `
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-light); gap: 10px; opacity: 0.7; animation: popIn 0.3s ease-out;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 28px; color: var(--primary);"></i>
      <span style="font-size: 13px; font-weight: 500;">Özel günler getiriliyor...</span>
    </div>
  `;

  try {
    const response = await fetch(SERVER_URL + '/api/special-days');
    const data = await response.json();

    specialDays = data;
    renderSpecialDays();

  } catch (error) {
    console.log("Özel Günler yüklenemedi:", error);
    specialDaysContainer.innerHTML = `<p style="text-align:center; color: var(--text-light);">Bağlantı hatası oluştu.</p>`;
  }
}

function renderSpecialDays() {
  const container = document.getElementById('special-days-container');
  container.innerHTML = '';

  let sortedDays = specialDays.map(dayItem => {
    return {
      ...dayItem,
      remainingDays: calculateRemainingDays(dayItem.date)
    };
  });

  sortedDays.sort((a, b) => a.remainingDays - b.remainingDays);

  sortedDays.forEach(dayItem => {
    const dayHTML = `
      <div class="special-day-item">
        <div class="day-icon" style="background: ${dayItem.color};">
          <i class="fa-solid ${dayItem.icon}"></i>
        </div>
                
        <div class="day-info">
          <h4>${dayItem.title}</h4>
        </div>
                
        <div class="day-end">
          <span class="day-date">${dayItem.dateFormat}</span>
          <div class="day-countdown">
            <span>${dayItem.remainingDays}</span> Gün
          </div>
        </div>
      </div>
        `;
    container.innerHTML += dayHTML;
  });
}



async function loadPeriodData() {
  try {
    const response = await fetch(SERVER_URL + '/api/period');
    const data = await response.json();

    if (data && data.lastStartDate) {
      periodData.lastStartDate = data.lastStartDate;
    }

    renderPeriodTracker();
  } catch (error) {
    console.log("Period verisi çekilemedi:", error);
    renderPeriodTracker();
  }
}

function renderPeriodTracker() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastStart = new Date(periodData.lastStartDate);

  const nextPeriod = new Date(lastStart);
  nextPeriod.setDate(lastStart.getDate() + periodData.cycleLength);

  const diffTime = nextPeriod - today;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const daysPassed = periodData.cycleLength - daysLeft;
  let progressPercent = (daysPassed / periodData.cycleLength) * 100;
  if (progressPercent > 100) progressPercent = 100;
  if (progressPercent < 0) progressPercent = 0;

  const statusBadge = document.getElementById('period-status-badge');
  const periodText = document.getElementById('period-text');
  const progressBar = document.getElementById('period-progress-bar');
  const actionArea = document.getElementById('period-action-area');

  progressBar.style.width = `${progressPercent}`;

  if (daysLeft <= 0) {
    statusBadge.innerText = "Döngü Başladı / Gecikti";
    statusBadge.style.background = "#FFCDD2";
    statusBadge.style.color = "#D32F2F";
    periodText.innerHTML = `Dikkatli ve ekstra şefkatli olma zamanı!`;
  } else if (daysLeft <= 7) {
    statusBadge.innerText = "Yaklaşıyor";
    statusBadge.style.background = "#FFF9C4";
    statusBadge.style.color = "#F57F17";
    periodText.innerHTML = `Tahmini sonraki döngüye: <strong>${daysLeft} Gün</strong> (Hassas dönem başlayabilir)`;
  } else {
    statusBadge.innerText = "Güvenli";
    statusBadge.style.background = "#E8F5E9";
    statusBadge.style.color = "#4CAF50";
    periodText.innerHTML = `Tahmini sonraki döngüye: <strong>${daysLeft} Gün</strong>`;
  }

  if (currentUser === 'elif') {
    actionArea.innerHTML = `<button class="btn-small" onclick="openPeriodModal()">Tarihi Güncelle & Not Bırak 🌸</button>`;
  } else {
    actionArea.innerHTML = `<p style="font-size:11px; text-align:center; color:var(--text-light); margin-top:10px;">
      <i class=fa-solid fa-lock"></i> Sadece Elif düzenleyebilir
      </p>`;
  }
}

// --- MODAL İŞLEMLERİ ---

function openModal() {
  document.getElementById('add-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('add-modal').style.display = 'none';
}

const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

document.getElementById('add-day-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const titleInput = document.getElementById('day-title').value;
  const dateInput = document.getElementById('day-date').value;
  const iconInput = document.getElementById('day-icon').value;

  const dateObj = new Date(dateInput);
  const dayText = dateObj.getDate() + " " + monthNames[dateObj.getMonth()];

  try {
    const response = await fetch(SERVER_URL + '/api/special-days', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: titleInput,
        date: dateInput,
        icon: iconInput,
        color: "var(--accent)",
        dateFormat: dayText
      })
    });

    if (response.ok) {
      this.reset();
      closeModal();
      loadSpecialDays();
    }
  } catch (error) {
    console.log("Özel gün kaydedilemedi:", error);
  }
});

// --- NOTLAR MANTIĞI ---

async function loadMessages() {
  const chatBox = document.getElementById('chat-box');
  // Yükleniyor Ekranı
  chatBox.innerHTML = `
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-light); gap: 10px; opacity: 0.7; animation: popIn 0.3s ease-out;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 28px; color: var(--primary);"></i>
      <span style="font-size: 13px; font-weight: 500;">Geçmiş anılar getiriliyor...</span>
    </div>
  `;

  try {
    const response = await fetch(SERVER_URL + '/api/messages');
    const messages = await response.json();

    chatBox.innerHTML = '';

    let lastDateString = "";
    const todayString = new Date().toLocaleDateString('tr-TR');

    messages.forEach(msg => {
      const isSentByMe = msg.sender === currentUser;
      const bubbleClass = isSentByMe ? 'sent' : 'received';
      const avatar = msg.sender === 'alpturk' ? '🧑🏻' : '👩🏻';

      const dateObj = new Date(msg.timestamp);
      const timeString = dateObj.getHours().toString().padStart(2, '0') + ':' +
        dateObj.getMinutes().toString().padStart(2, '0');

      const msgDateString = dateObj.toLocaleDateString('tr-TR');

      if (msgDateString !== lastDateString) {
        const displayDate = (msgDateString === todayString) ? "Bugün" : msgDateString;

        const dividerHTML = `
        <div style="text-align:center; margin: 15px auto; font-size: 11px; color: var(--text-light); background: rgba(0,0,0,0.04); padding: 4px 14px; border-radius: 12px; width: max-content; font-weight: 600;">
          ${displayDate}
        </div>
        `;
        chatBox.innerHTML += dividerHTML;
        lastDateString = msgDateString;
      }

      const tickHTML = isSentByMe ? `<i class="fa-solid fa-check msg-tick"></i>` : '';

      const messageHTML = `
      <div class="message-bubble ${bubbleClass}" style="animation: popIn 0.3s ease-out;">
        ${!isSentByMe ? `<div class="msg-avatar">${avatar}</div>` : ''}
        <div class="msg-content">
          <p>${msg.text}</p>
          <span class="msg-time">
            ${timeString}
            ${tickHTML}
          </span>
        </div>
        ${isSentByMe ? `<div class="msg-avatar">${avatar}</div>` : ''}
      </div>
      `;

      chatBox.innerHTML += messageHTML;
    });
  } catch (error) {
    console.log("Mesajlar yüklenemedi:", error);
  }
}

async function sendMessage() {
  const inputField = document.getElementById('message-input');

  if (!inputField) return;
  const messageText = inputField.value.trim();
  if (messageText === '') return;

  try {
    const response = await fetch(SERVER_URL + '/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: currentUser,
        text: messageText
      })
    });

    if (response.ok) {
      inputField.value = '';
      loadMessages();
      socket.emit('chatMessageSent');
    }
  } catch (error) {
    console.log("Mesaj gönderilemedi:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadMessages();

  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    messageInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});

// --- ADET DÖNGÜSÜ MODAL İŞLEMLERİ ---

function openPeriodModal() {
  document.getElementById('period-modal').style.display = 'flex';
}

function closePeriodModal() {
  document.getElementById('period-modal').style.display = 'none';
}

document.getElementById('update-period-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const newDate = document.getElementById('new-period-date').value;
  const note = document.getElementById('period-note').value;

  if (newDate) {
    periodData.lastStartDate = newDate;

    renderPeriodTracker();
  }

  if (note) {
    console.log("Elif'in Notu:", note);
  }

  this.reset();
  closePeriodModal();
});

function openGame() {
  document.querySelectorAll('.content').forEach(page => page.style.display = 'none');
  document.getElementById('game-page').style.display = 'block';

  initMemoryGame();
}

function closeGame() {
  document.querySelectorAll('.content').forEach(page => page.style.display = 'none');
  document.getElementById('home-page').style.display = 'block';
}

// FOTO PUZZLE OYUNU
const memoryEmojis = ['🥰', '☕', '🎮', '🧟‍♂️', '🎢', '📸'];
let cards = [...memoryEmojis, ...memoryEmojis]; // Her birinden 2 tane -> Toplam 12

let hasFlippedCard = false;
let lockBoard = false;
let firstCard, secondCard;
let mistakes = 0;
let matchedPairs = 0;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function initMemoryGame() {
  const board = document.getElementById('memory-board');
  board.innerHTML = '';

  mistakes = 0;
  matchedPairs = 0;
  document.getElementById('mistake-count').innerText = mistakes;
  resetBoard();

  cards = shuffle(cards);

  cards.forEach(emoji => {
    const cardElement = document.createElement('div');
    cardElement.classList.add('memory-card');
    cardElement.dataset.emoji = emoji;

    cardElement.innerHTML = `
        <div class="card-front">${emoji}</div>
        <div class="card-back"><i class="fa-solid fa-question"></i></div>
    `;
    cardElement.addEventListener('click', flipCard);
    board.appendChild(cardElement);
  });
}

function flipCard() {
  if (lockBoard) return;
  if (this === firstCard) return;

  this.classList.add('flip');

  if (!hasFlippedCard) {
    hasFlippedCard = true;
    firstCard = this;
    return;
  }

  secondCard = this;
  checkForMatch();
}

function checkForMatch() {
  let isMatch = firstCard.dataset.emoji === secondCard.dataset.emoji;

  if (isMatch) {
    disableCards();
    matchedPairs++;

    if (matchedPairs === memoryEmojis.length) {
      setTimeout(() => {
        alert(`Tebrikler Bebeğim! Kusursuzsun. Hata sayın ${mistakes}! 🎉`);
      }, 500);
    }
  } else {
    unflipCards();
    mistakes++;
    document.getElementById('mistake-count').innerText = mistakes;
  }
}

function disableCards() {
  firstCard.removeEventListener('click', flipCard);
  secondCard.removeEventListener('click', flipCard);
  resetBoard();
}

function unflipCards() {
  lockBoard = true;

  setTimeout(() => {
    firstCard.classList.remove('flip');
    secondCard.classList.remove('flip');
    resetBoard();
  }, 1000);
}

function resetBoard() {
  hasFlippedCard = false;
  lockBoard = false;
  firstCard = null;
  secondCard = null;
}

// --- CANLI MESAFE MANTIĞI

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- YENİ VE GÜÇLÜ: ARKA PLAN CANLI KONUM SİSTEMİ ---
function updateLiveDistance() {
  const headerVal = document.getElementById('header-distance-val');

  // 1. Eğer telefondaysak (Capacitor ortamı aktifse) arka plan takibini çalıştır
  if (BackgroundGeolocation) {
    BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "Bizim Dünyamız arka planda konumunuzu güncelliyor.",
        backgroundTitle: "Bizim Dünyamız",
        requestPermissions: true,
        stale: false,
        stopOnTerminate: false,
        startOnBoot: true,
        distanceFilter: 10
      },
      (location, error) => {
        if (error) {
          if (error.code === "NOT_AUTHORIZED") {
            if (confirm("Uygulamanın çalışması için ayarlardan 'Her Zaman İzin Ver' seçeneğini açmalısın. Ayarlara gidelim mi?")) {
              BackgroundGeolocation.openSettings();
            }
          }
          return console.error("Konum hatası:", error);
        }

        const myLat = location.latitude;
        const myLng = location.longitude;
        const speed = location.speed ? (location.speed * 3.6).toFixed(1) : "0.0";

        const distance = calculateDistance(myLat, myLng, partnerLocation.lat, partnerLocation.lng);

        if (headerVal) headerVal.innerText = distance.toFixed(1);

        const modal = document.getElementById('location-modal');
        if (modal && modal.style.display === 'flex') {
          updateMap(myLat, myLng, speed);
        }

        if (socket.connected) {
          socket.emit('sendLocation', {
            user: currentUser,
            lat: myLat,
            lng: myLng,
            speed: speed
          });
        }
        fetch(SERVER_URL + '/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: currentUser,
            lat: myLat,
            lng: myLng,
            speed: speed
          })
        }).catch(err => console.log("Arka plan konum HTTP gönderim hatası:", err));
      }
    ).then(function (watcher_id) {
      console.log("Arka plan izleyici ID'si:", watcher_id);
    });
  }
  // 2. Eğer bilgisayarda/tarayıcıda test ediyorsak standart tarayıcı konumunu kullan (Uygulama çökmesin)
  else if (navigator.geolocation) {
    console.log("Tarayıcı (Web) konumu kullanılıyor...");
    navigator.geolocation.watchPosition(
      (position) => {
        const myLat = position.coords.latitude;
        const myLng = position.coords.longitude;
        const speed = position.coords.speed ? (position.coords.speed * 3.6).toFixed(1) : "0.0";
        const distance = calculateDistance(myLat, myLng, partnerLocation.lat, partnerLocation.lng);

        if (headerVal) headerVal.innerText = distance.toFixed(1);

        const modal = document.getElementById('location-modal');
        if (modal && modal.style.display === 'flex') {
          updateMap(myLat, myLng, speed);
        }

        socket.emit('sendLocation', {
          user: currentUser,
          lat: myLat,
          lng: myLng,
          speed: speed
        });

        fetch(SERVER_URL + '/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: currentUser, lat: myLat, lng: myLng, speed: speed })
        }).catch(() => { });
      },
      (error) => {
        console.log("Web konum alınamadı:", error);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }
}

async function loadLocations() {
  try {
    const response = await fetch(SERVER_URL + '/api/locations');
    const data = await response.json();

    data.forEach(loc => {
      if (loc.user !== currentUser) {
        partnerLocation.lat = loc.lat;
        partnerLocation.lng = loc.lng;
        partnerLocation.speed = loc.speed || "0.0";
      }
    });
  } catch (error) {
    console.log("Konumlar yüklenemedi:", error);
  }
}

function updateGreeting() {
  const greetingElement = document.getElementById('dynamic-greeting');
  if (!greetingElement) return;

  const hour = new Date().getHours();

  const name = (currentUser === 'elif') ? "bebeğim" : "sevgilim";

  if (hour >= 5 && hour < 12) {
    greetingElement.innerText = `Günaydın ${name}, harika bir gün olsun! ☀️`;
  } else if (hour >= 12 && hour < 18) {
    greetingElement.innerText = `Tünaydın ${name}, günün nasıl geçiyor? ☕`;
  } else if (hour >= 18 && hour < 23) {
    greetingElement.innerText = `İyi akşamlar ${name}, seni çok özledim! 💖`;
  } else {
    greetingElement.innerText = `Gece kuşu musun ${name}? İyi geceler 🌙`;
  }
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle('dark-mode');

  const isDark = body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark);

  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  const themeIcon = document.querySelector('#theme-toggle i');
  if (!themeIcon) return;

  if (isDark) {
    themeIcon.className = 'fa-solid fa-sun';
    themeIcon.style.color = '#F1C40F';
  } else {
    themeIcon.className = 'fa-solid fa-moon';
    themeIcon.style.color = 'var(--text-dark)';
  }
}

// --- SANAL BEBEK FRONTEND ---
function openPet() {
  document.querySelectorAll('.content').forEach(page => page.style.display = 'none');
  document.getElementById('pet-page').style.display = 'block';
}

function closePet() {
  document.getElementById('pet-page').style.display = 'none';
  document.getElementById('home-page').style.display = 'block';
}

function feedPet() {
  const pet = document.getElementById('the-pet');
  const msg = document.getElementById('pet-message');

  // Zıplama efekti
  pet.style.transform = 'scale(1.2) translateY(-20px)';
  msg.innerText = "Yummy! Yemek çok güzel";

  setTimeout(() => {
    pet.style.transform = '';
  }, 300);
}

function lovePet() {
  const msg = document.getElementById('pet-message');
  msg.innerText = "Pırrrrr... Seni çok seviyorum! 💖🐾";
}

function openLocationModal() {
  const modal = document.getElementById('location-modal');
  modal.style.display = 'flex';

  if (map) {
    setTimeout(() => { map.invalidateSize(); }, 100);
  }
}

function closeLocationModal() {
  document.getElementById('location-modal').style.display = 'none';
}

// --- HARİTAYI ÇİZME VE GÜNCELLEME ---

function updateMap(myLat, myLng, speed) {

  if (!map) {
    map = L.map('map');

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    // Sabit Konumları (Evleri) Haritaya Ekle
    L.marker(alpturkHomeCoords, { icon: homeIcon }).bindPopup("Alptürk'ün Evi 🏠").addTo(map);
    L.marker(elifHomeCoords, { icon: homeIcon }).bindPopup("Elif'in Evi 🏠").addTo(map);

    // Bizim Canlı PİNLERİMİZİ Ekle (Fotoğraflı)
    myMarker = L.marker([myLat, myLng], { icon: createProfileIcon(myPhoto, speed) }).addTo(map);
    partnerMarker = L.marker([partnerLocation.lat, partnerLocation.lng], { icon: createProfileIcon(partnerPhoto, partnerLocation.speed) }).addTo(map);

    const group = new L.featureGroup([myMarker, partnerMarker]);
    map.fitBounds(group.getBounds().pad(0.2));
  } else {
    myMarker.setLatLng([myLat, myLng]);
    myMarker.setIcon(createProfileIcon(myPhoto, speed));
  }
}

function createProfileIcon(photoUrl, speed) {
  return L.divIcon({
    className: 'custom-icon-wrapper',
    html: `
      <div class="custom-profile-pin">
       <img src="${photoUrl}" alt:"Profile">
       <div class="pin-speed-badge">${speed} km/s</div>
      </div>
    `,
    iconSize: [60, 70],
    iconAnchor: [30, 35]
  });
}

socket.on('updatePartnerLocation', (data) => {
  console.log("Bebeğinden yeni konum geldi!", data);

  partnerLocation.lat = data.lat;
  partnerLocation.lng = data.lng;

  if (map && partnerMarker) {
    partnerMarker.setLatLng([data.lat, data.lng]);
    partnerMarker.setIcon(createProfileIcon(partnerPhoto, data.speed));
  }

  if (myMarker) {
    const myCurrentPos = myMarker.getLatLng();
    const newDistance = calculateDistance(myCurrentPos.lat, myCurrentPos.lng, data.lat, data.lng);
    const headerVal = document.getElementById('header-distance-val');
    if (headerVal) headerVal.innerText = newDistance.toFixed(1);
  }
});

socket.on('refreshMessages', () => {
  loadMessages();
})

socket.on('updateLampColor', (data) => {
  lampStates[data.user] = { mood: data.mood, color: data.color };
  const lampElement = document.getElementById(data.user + '-lamp');
  if (lampElement) applyMoodToElement(lampElement, data.color);
});
