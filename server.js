const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const quizRoutes = require("./routes/quizRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const resultsRoutes = require("./routes/resultRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminPrivateExamRoutes = require("./routes/adminPrivateExamRoutes");
const privateExamRoutes = require("./routes/privateExamRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";
const allowAnyOrigin =
  String(process.env.CORS_ALLOW_ANY_ORIGIN || "true").toLowerCase() !== "false";
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "");

const parseAllowedOrigins = () => {
  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URLS,
    process.env.ALLOWED_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map(normalizeOrigin)
    .filter(Boolean);

  const devOrigins = isProduction
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

  return new Set([...devOrigins, ...envOrigins]);
};

const allowedOrigins = parseAllowedOrigins();

const isAllowedDevLanOrigin = (origin) => {
  if (isProduction || !origin) return false;

  try {
    const { protocol, hostname, port } = new URL(origin);
    const allowedDevPorts = new Set(["3000", "5173"]);
    if (protocol !== "http:" || !allowedDevPorts.has(port)) return false;

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
};

const isValidHttpOrigin = (origin) => {
  if (!origin) return false;

  try {
    const { protocol } = new URL(origin);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      (allowAnyOrigin && isValidHttpOrigin(origin)) ||
      allowedOrigins.has(normalizeOrigin(origin)) ||
      isAllowedDevLanOrigin(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-exam-session",
    "ngrok-skip-browser-warning",
  ],
  maxAge: 86400,
};

const validateRequiredEnv = () => {
  const required = ["MONGO_URI", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
  }
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "SBT-Exam backend is running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/auth", authRoutes);
app.use("/quiz", quizRoutes);
app.use("/certificate", certificateRoutes);
app.use("/user", resultsRoutes);
app.use("/admin", adminRoutes);
app.use("/admin/private-exams", adminPrivateExamRoutes);
app.use("/private-exams", privateExamRoutes);
app.use("/notifications", notificationRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  if (err.message?.startsWith("CORS blocked origin")) {
    return res.status(403).json({
      success: false,
      message: "This origin is not allowed to access the API.",
    });
  }

  if (err.name === "MulterError" || err.message === "Only image files are allowed.") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  console.error("Unhandled server error:", err);
  return res.status(500).json({
    success: false,
    message: "Server error",
  });
});

// Connect to MongoDB and start server
validateRequiredEnv();
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB connected");
  const port = process.env.PORT || 5000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
})
.catch((err) => console.log(err));
