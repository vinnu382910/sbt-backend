const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const {
  getMyPrivateExams,
  getPrivateExamById,
  startPrivateExam,
  submitPrivateExam,
} = require("../controllers/privateExamController");

router.use(verifyToken);

router.get("/my", getMyPrivateExams);
router.get("/:id", getPrivateExamById);
router.post("/:id/start", startPrivateExam);
router.post("/:id/submit", submitPrivateExam);

module.exports = router;
