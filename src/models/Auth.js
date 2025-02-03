const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');

const authSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    assignedContacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Contact",
      },
    ],
    stats: {
      lastActive: { type: Date },
      lastAssignment: { type: Date },
      totalCallsMade: { type: Number, default: 0 },
      uniqueContactsCalled: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
authSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
authSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Create indexes
authSchema.index({ email: 1 });

const Auth = mongoose.model("Auth", authSchema);
module.exports = Auth;
