const mongoose = require('mongoose');

console.log('Initializing User Schema...');

const userSchema = new mongoose.Schema({
  'sl no': {
    type: Number,
    required: true
  },
  'pm no': {
    type: String,
    required: true
  },
  'enrollment no': {
    type: String,
    required: true
  },
  'name': {
    type: String,
    required: true
  },
  'phone no 1': {
    type: String,
    default: null
  },
  'phone no 2': {
    type: String,
    default: null
  },
  'phone no 3': {
    type: String,
    default: null
  },
  'phone no 4': {
    type: String,
    default: null
  },
  'address': {
    type: String,
    default: ''
  },
  phoneStatuses: [{
    number: String,
    called: {
      type: Boolean,
      default: false
    }
  }]
}, {
  collection: 'users_data',
  strict: false,
  timestamps: false
});

// Add middleware to initialize phoneStatuses if not present
userSchema.pre('save', function(next) {
  if (!this.phoneStatuses) {
    this.phoneStatuses = [];
    const phones = [
      this['phone no 1'],
      this['phone no 2'],
      this['phone no 3'],
      this['phone no 4']
    ].filter(phone => phone);

    phones.forEach(phone => {
      this.phoneStatuses.push({
        number: phone,
        called: false
      });
    });
  }
  next();
});

// Virtual getter for formatted phone numbers
userSchema.virtual('formattedPhoneNumbers').get(function() {
  return [
    { type: 'Phone 1', number: this['phone no 1'] },
    { type: 'Phone 2', number: this['phone no 2'] },
    { type: 'Phone 3', number: this['phone no 3'] },
    { type: 'Phone 4', number: this['phone no 4'] }
  ].filter(phone => phone.number);
});

// Set toJSON option to include virtuals
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.slNo = ret['sl no'];
    ret.pmNo = ret['pm no'];
    ret.enrollmentNo = ret['enrollment no'];
    ret.phoneNumbers = ret.formattedPhoneNumbers;
    
    // Remove the original fields
    delete ret['sl no'];
    delete ret['pm no'];
    delete ret['enrollment no'];
    delete ret['phone no 1'];
    delete ret['phone no 2'];
    delete ret['phone no 3'];
    delete ret['phone no 4'];
    delete ret.formattedPhoneNumbers;
    delete ret.__v;
    
    return ret;
  }
});

// Create the model
const UserModel = mongoose.model('User', userSchema, 'users_data');

console.log('User Model created with collection:', UserModel.collection.name);

module.exports = UserModel;
