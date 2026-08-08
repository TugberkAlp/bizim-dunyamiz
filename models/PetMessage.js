const mongoose = require('mongoose');

const petMessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    enum: ['alpturk', 'elif', 'galaksi'] // Mesajı kimin attığı (kedi de dahil)
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PetMessage', petMessageSchema);