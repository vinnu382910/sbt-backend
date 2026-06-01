const express = require("express");
const router = express.Router();
const multer = require("multer");
const { verifyToken, adminOnly } = require("../middleware/authMiddleware");
const {
  getDashboardStats,
  getUsers,
  updateUserStatus,
  uploadQuestionImage,
  deleteQuestionImage,
  getQuizzes,
  createQuiz,
  updateQuiz,
  archiveQuiz,
  cloneQuiz,
  createQuizVersion,
  deleteQuiz,
  getResults,
} = require("../controllers/adminController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    return cb(null, true);
  },
});

router.use(verifyToken, adminOnly);

router.get("/dashboard", getDashboardStats);

router.get("/users", getUsers);
router.patch("/users/:id", updateUserStatus);

router.post("/question-image", upload.single("image"), uploadQuestionImage);
router.delete("/question-image", deleteQuestionImage);

router.get("/quizzes", getQuizzes);
router.post("/quizzes", createQuiz);
router.put("/quizzes/:id", updateQuiz);
router.patch("/quizzes/:id/archive", archiveQuiz);
router.post("/quizzes/:id/clone", cloneQuiz);
router.post("/quizzes/:id/new-version", createQuizVersion);
router.delete("/quizzes/:id", deleteQuiz);

router.get("/results", getResults);

module.exports = router;
