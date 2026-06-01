const PrivateExam = require("../models/PrivateExam");
const ExamAssignment = require("../models/ExamAssignment");
const Notification = require("../models/Notification");

const nowMs = () => Date.now();

const computeExamState = (exam) => {
  const current = nowMs();
  const start = new Date(exam.startTime).getTime();
  const end = new Date(exam.endTime).getTime();
  if (current < start) return "UPCOMING";
  if (current > end) return "COMPLETED";
  return "ONGOING";
};

const markMissedAssignmentsForUser = async (userId) => {
  const current = new Date();
  const assigned = await ExamAssignment.find({
    userId,
    status: { $in: ["ASSIGNED", "STARTED"] },
  }).select("_id examId");

  if (!assigned.length) return;

  const examIds = assigned.map((a) => a.examId);
  const expiredExams = await PrivateExam.find({
    _id: { $in: examIds },
    endTime: { $lt: current },
  }).select("_id");

  if (!expiredExams.length) return;
  const expiredSet = new Set(expiredExams.map((e) => String(e._id)));
  const idsToMiss = assigned.filter((a) => expiredSet.has(String(a.examId))).map((a) => a._id);
  if (idsToMiss.length) {
    await ExamAssignment.updateMany({ _id: { $in: idsToMiss } }, { $set: { status: "MISSED" } });
  }
};

const fetchAssignedExam = async (examId, userId) => {
  const assignment = await ExamAssignment.findOne({ examId, userId });
  if (!assignment) return { error: "You are not assigned to this private exam.", code: 403 };

  const exam = await PrivateExam.findById(examId);
  if (!exam) return { error: "Exam not found.", code: 404 };
  if (!exam.isActive) return { error: "Exam is currently inactive.", code: 400 };

  return { exam, assignment };
};

exports.getMyPrivateExams = async (req, res) => {
  try {
    const userId = req.user.id;
    await markMissedAssignmentsForUser(userId);

    const assignments = await ExamAssignment.find({ userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "examId",
        model: "PrivateExam",
      })
      .lean();

    const data = assignments
      .filter((a) => a.examId)
      .map((a) => {
        const state = computeExamState(a.examId);
        return {
          assignmentId: a._id,
          examId: a.examId._id,
          title: a.examId.title,
          description: a.examId.description,
          level: a.examId.level,
          technologies: a.examId.technologies || [],
          timeLimit: a.examId.timeLimit,
          passMarks: a.examId.passMarks,
          startTime: a.examId.startTime,
          endTime: a.examId.endTime,
          status: a.status,
          computedState: state,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          score: a.score,
        };
      });

    return res.status(200).json({ success: true, exams: data });
  } catch (error) {
    console.error("Get my private exams error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getPrivateExamById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await fetchAssignedExam(id, userId);
    if (result.error) return res.status(result.code).json({ success: false, message: result.error });
    const { exam, assignment } = result;

    const state = computeExamState(exam);
    if (state === "COMPLETED" && assignment.status === "ASSIGNED") {
      assignment.status = "MISSED";
      await assignment.save();
    }

    const questions = exam.questions.map((q) => ({
      questionText: q.questionText,
      imageUrl: q.imageUrl || "",
      imageAlt: q.imageAlt || "",
      codeSnippet: q.codeSnippet || "",
      codeLanguage: q.codeLanguage || "",
      options: q.options,
    }));

    return res.status(200).json({
      success: true,
      exam: {
        id: exam._id,
        title: exam.title,
        description: exam.description,
        level: exam.level,
        technologies: exam.technologies,
        timeLimit: exam.timeLimit,
        passMarks: exam.passMarks,
        startTime: exam.startTime,
        endTime: exam.endTime,
        computedState: state,
        status: assignment.status,
        questions,
      },
    });
  } catch (error) {
    console.error("Get private exam by id error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.startPrivateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await fetchAssignedExam(id, userId);
    if (result.error) return res.status(result.code).json({ success: false, message: result.error });
    const { exam, assignment } = result;

    const current = nowMs();
    const start = new Date(exam.startTime).getTime();
    const end = new Date(exam.endTime).getTime();

    if (current < start) {
      return res.status(400).json({ success: false, message: "Exam has not started yet." });
    }
    if (current > end) {
      if (assignment.status === "ASSIGNED") {
        assignment.status = "MISSED";
        await assignment.save();
      }
      return res.status(400).json({ success: false, message: "Exam window closed." });
    }
    if (assignment.status === "SUBMITTED") {
      return res.status(400).json({ success: false, message: "You already submitted this exam." });
    }

    if (assignment.status === "ASSIGNED") {
      assignment.status = "STARTED";
      assignment.startedAt = new Date();
      await assignment.save();
    }

    return res.status(200).json({
      success: true,
      message: "Exam started.",
      examWindow: { startTime: exam.startTime, endTime: exam.endTime },
    });
  } catch (error) {
    console.error("Start private exam error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.submitPrivateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { answers = [] } = req.body;

    const result = await fetchAssignedExam(id, userId);
    if (result.error) return res.status(result.code).json({ success: false, message: result.error });
    const { exam, assignment } = result;

    if (assignment.status === "SUBMITTED") {
      return res.status(400).json({ success: false, message: "Exam already submitted." });
    }

    const current = nowMs();
    const start = new Date(exam.startTime).getTime();
    const end = new Date(exam.endTime).getTime();
    if (current < start) {
      return res.status(400).json({ success: false, message: "Exam has not started yet." });
    }
    if (current > end && assignment.status === "ASSIGNED") {
      assignment.status = "MISSED";
      await assignment.save();
      return res.status(400).json({ success: false, message: "Exam window closed." });
    }

    let score = 0;
    exam.questions.forEach((question, index) => {
      const answer = answers[index];
      if (answer && answer === question.correctAnswer) score += 1;
    });

    assignment.status = "SUBMITTED";
    assignment.submittedAt = new Date();
    assignment.score = score;
    await assignment.save();

    await Notification.create({
      userId,
      type: "RESULT",
      title: "Private Exam Submitted",
      message: `You submitted ${exam.title}. Score: ${score}/${exam.questions.length}`,
      link: `/private-exams/${exam._id}`,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      score,
      totalQuestions: exam.questions.length,
      pass: score >= exam.passMarks,
      passMarks: exam.passMarks,
    });
  } catch (error) {
    console.error("Submit private exam error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    return res.status(200).json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
    return res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
