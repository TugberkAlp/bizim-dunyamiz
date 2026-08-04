const mongoose = require('mongoose');

const specialDaySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  color: {
    type: String,
    required: true
  },
  dateFormat: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('SpecialDay', specialDaySchema);