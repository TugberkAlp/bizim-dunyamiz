const mongoose = require('mongoose');

const dailyQuestionSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  alpturkAnswer: { type: String, default: "" },
  elifAnswer: { type: String, default: "" }
});

module.exports = mongoose.model('DailyQuestion', dailyQuestionSchema);