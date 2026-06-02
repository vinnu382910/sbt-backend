const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["USER", "ADMIN", "SUPER_ADMIN"],
    default: "USER",
  },
  isActive: { type: Boolean, default: true },
  isSuspended: { type: Boolean, default: false },
  lastLogin: { type: Date, default: null },
  isVerified: { type: Boolean, default: true },
});

module.exports = mongoose.model("User", userSchema);
