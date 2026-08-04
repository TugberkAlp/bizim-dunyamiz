const mongoose = require('mongoose');

const periodSchema = new mongoose.Schema({
  lastStartDate: {
    type: Date,
    required: true
  },
  note: {
    type: String
  }
});

module.exports = mongoose.model('Period', periodSchema);