const express = require("express");
const router = express.Router();
const { verifyToken, adminOnly } = require("../middleware/authMiddleware");
const {
  createPrivateExam,
  updatePrivateExam,
  deletePrivateExam,
  getPrivateExams,
  assignPrivateExam,
} = require("../controllers/adminPrivateExamController");

router.use(verifyToken, adminOnly);

router.post("/create", createPrivateExam);
router.put("/:id", updatePrivateExam);
router.delete("/:id", deletePrivateExam);
router.get("/", getPrivateExams);
router.post("/:id/assign", assignPrivateExam);

module.exports = router;
