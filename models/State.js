const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema({
  user: {type: String, require: true, unique: true},
  isAtWork: { type: Boolean, default: false },
  isAtHome: { type: Boolean, default: false },
  isNearPartner: { type: Boolean, default: false }
});

const State = mongoose.model('State', stateSchema);
module.exports = State;