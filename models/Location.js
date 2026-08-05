const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  user: { type: String, required: true }, // Kimin konumu?
  lat: { type: Number, required: true },  // Enlem koordinatı
  lng: { type: Number, required: true },  // Boylam koordinatı
  speed: { type: String, default: "0.0" }, // O anki hız
  updatedAt: { type: Date, default: Date.now } // Konumun güncellenme zamanı (Otomatik)
});

module.exports = mongoose.model('Location', locationSchema);