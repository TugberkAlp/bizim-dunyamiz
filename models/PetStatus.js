const mongoose = require('mongoose');

const petStatus = new mongoose.Schema({
  food: {
    type: Number,
    default: 60
  },
  love: {
    type: Number,
    default: 85
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PetStatus', petStatus);