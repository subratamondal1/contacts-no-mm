const mongoose = require('mongoose');

const authSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  assignedContacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  }],
  name: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const Auth = mongoose.model('Auth', authSchema);
module.exports = Auth;
