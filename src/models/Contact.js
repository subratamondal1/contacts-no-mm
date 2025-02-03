const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Auth",
      default: null,
    },
    status: {
      type: String,
      enum: ['unassigned', 'assigned', 'contacted'],
      default: 'unassigned'
    },
    assignmentDate: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

// Update status when assigned
contactSchema.pre('save', function(next) {
  if (this.isModified('assignedTo')) {
    this.status = this.assignedTo ? 'assigned' : 'unassigned';
    this.assignmentDate = this.assignedTo ? new Date() : null;
  }
  next();
});

const Contact = mongoose.model("Contact", contactSchema);

module.exports = Contact;
