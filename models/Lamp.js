const mongoose = require('mongoose');

const lampSchema = new mongoose.Schema({
  user: { type: String, required: true },
  mood: { type: String, default: 'mutlu' },
  color: { type: String, default: '#e5cd85' }
});

module.exports = mongoose.model('Lamp', lampSchema);