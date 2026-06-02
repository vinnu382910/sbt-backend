const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { setAuthCookie, clearAuthCookie } = require("../utils/authCookie");

const isStrongPassword = (password) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  isSuspended: user.isSuspended,
  isVerified: user.isVerified,
});

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || "").toLowerCase().trim();

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: true,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful. Please login.",
      email: user.email,
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

exports.login = async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || "").toLowerCase().trim();
    const { password } = req.body;

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid credentials." });
    }
    if (!user.isActive || user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive or suspended. Contact admin.",
      });
    }

    user.lastLogin = new Date();
    if (!user.isVerified) {
      user.isVerified = true;
    }
    await user.save();
    const token = signToken(user._id);
    setAuthCookie(res, token, req);

    return res.status(200).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

exports.logout = async (req, res) => {
  clearAuthCookie(res, req);
  return res.status(200).json({ success: true, message: "Logged out successfully." });
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    return res.status(200).json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    console.error("Me error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
