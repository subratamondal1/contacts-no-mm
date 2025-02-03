const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
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
    name: {
      type: String,
      required: true
    },
    'phone no 1': String,
    'phone no 2': String,
    'phone no 3': String,
    'phone no 4': String,
    address: String,
    // Additional fields for tracking
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    isAssigned: {
      type: Boolean,
      default: false
    },
    phoneStatuses: [{
      number: String,
      called: {
        type: Boolean,
        default: false
      },
      lastCalled: Date,
      calledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    }]
  },
  {
    timestamps: true,
    collection: 'users_data' // Explicitly set the collection name
  }
);

// Update isAssigned when assignedTo changes
contactSchema.pre('save', function(next) {
  if (this.isModified('assignedTo')) {
    this.isAssigned = !!this.assignedTo;
  }
  next();
});

const Contact = mongoose.model("Contact", contactSchema);

module.exports = Contact;
