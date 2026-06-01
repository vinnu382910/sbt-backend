const PrivateExam = require("../models/PrivateExam");
const ExamAssignment = require("../models/ExamAssignment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const QuestionSet = require("../models/Question");
const { sendPrivateExamAssignedEmail } = require("../utils/emailService");
const { deleteImage } = require("../utils/cloudinaryService");

const parsePaging = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(query.limit, 10) || 10, 1);
  return { page, limit, skip: (page - 1) * limit };
};

const toSlug = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeQuestionPayload = (questions = []) => {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("At least one question is required.");
  }

  return questions.map((q, index) => {
    const questionText = String(q.questionText || "").trim();
    const options = Array.isArray(q.options)
      ? q.options.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const correctAnswer = String(q.correctAnswer || "").trim();

    if (!questionText) throw new Error(`Question ${index + 1}: questionText is required.`);
    if (options.length < 2) throw new Error(`Question ${index + 1}: at least 2 options are required.`);
    if (!correctAnswer) throw new Error(`Question ${index + 1}: correctAnswer is required.`);
    if (!options.includes(correctAnswer)) {
      throw new Error(`Question ${index + 1}: correctAnswer must match one option.`);
    }

    return {
      questionText,
      imageUrl: String(q.imageUrl || "").trim(),
      imagePublicId: String(q.imagePublicId || "").trim(),
      imageAlt: String(q.imageAlt || "").trim(),
      codeSnippet: String(q.codeSnippet || ""),
      codeLanguage: String(q.codeLanguage || "").trim(),
      options,
      correctAnswer,
    };
  });
};

const getQuestionImagePublicIds = (questions = []) =>
  questions
    .map((question) => String(question.imagePublicId || "").trim())
    .filter(Boolean);

const findRemovedQuestionImages = (oldQuestions = [], newQuestions = []) => {
  const nextIds = new Set(getQuestionImagePublicIds(newQuestions));
  return getQuestionImagePublicIds(oldQuestions).filter((publicId) => !nextIds.has(publicId));
};

const deleteUnusedQuestionImages = async (publicIds = [], excludePrivateExamId = null) => {
  const uniqueIds = [...new Set(publicIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  await Promise.all(
    uniqueIds.map(async (publicId) => {
      try {
        const privateFilter = { "questions.imagePublicId": publicId };
        if (excludePrivateExamId) privateFilter._id = { $ne: excludePrivateExamId };

        const [usedByPrivateExam, usedByPublicQuiz] = await Promise.all([
          PrivateExam.exists(privateFilter),
          QuestionSet.exists({ "questions.imagePublicId": publicId }),
        ]);

        if (!usedByPrivateExam && !usedByPublicQuiz) await deleteImage(publicId);
      } catch (error) {
        console.error(`Cloudinary cleanup failed for ${publicId}:`, error.message);
      }
    })
  );
};

const normalizeStatus = (exam) => {
  const now = Date.now();
  const startMs = new Date(exam.startTime).getTime();
  const endMs = new Date(exam.endTime).getTime();

  if (now > endMs) {
    exam.status = "COMPLETED";
    exam.isActive = false;
  } else {
    exam.status = "SCHEDULED";
  }
};

const validateTimes = (startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (end <= start) throw new Error("endTime must be after startTime.");
  return { start, end };
};

exports.createPrivateExam = async (req, res) => {
  try {
    const {
      title,
      description = "",
      timeLimit,
      passMarks,
      level = "Easy",
      technologies = [],
      questions = [],
      startTime,
      endTime,
    } = req.body;

    if (!title || !timeLimit || passMarks === undefined || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    const { start, end } = validateTimes(startTime, endTime);
    const normalizedQuestions = normalizeQuestionPayload(questions);

    const baseQuizId = toSlug(title);
    let quizId = baseQuizId;
    let suffix = 1;
    while (await PrivateExam.exists({ quizId })) {
      quizId = `${baseQuizId}-${suffix}`;
      suffix += 1;
    }

    const exam = await PrivateExam.create({
      title: String(title).trim(),
      description: String(description).trim(),
      quizId,
      timeLimit: Number(timeLimit),
      passMarks: Number(passMarks),
      level,
      technologies: Array.isArray(technologies)
        ? technologies.map((t) => String(t).trim()).filter(Boolean)
        : [],
      questions: normalizedQuestions,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      createdBy: req.user.id,
      isActive: true,
      status: "SCHEDULED",
    });

    return res.status(201).json({ success: true, exam });
  } catch (error) {
    console.error("Create private exam error:", error);
    return res.status(400).json({ success: false, message: error.message || "Server error" });
  }
};

exports.updatePrivateExam = async (req, res) => {
  try {
    const exam = await PrivateExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const hasStartedAssignments = await ExamAssignment.exists({
      examId: exam._id,
      status: { $in: ["STARTED", "SUBMITTED"] },
    });
    if (hasStartedAssignments) {
      return res.status(400).json({
        success: false,
        message: "Cannot edit exam after candidates have started/submitted.",
      });
    }

    const updates = { ...req.body };
    let removedImagePublicIds = [];
    if (updates.questions !== undefined) {
      updates.questions = normalizeQuestionPayload(updates.questions);
      removedImagePublicIds = findRemovedQuestionImages(exam.questions, updates.questions);
    }
    if (updates.startTime || updates.endTime) {
      const { start, end } = validateTimes(
        updates.startTime || exam.startTime,
        updates.endTime || exam.endTime
      );
      updates.startTime = start.toISOString();
      updates.endTime = end.toISOString();
    }

    Object.assign(exam, updates);
    normalizeStatus(exam);
    await exam.save();
    await deleteUnusedQuestionImages(removedImagePublicIds, exam._id);

    return res.status(200).json({ success: true, exam });
  } catch (error) {
    console.error("Update private exam error:", error);
    return res.status(400).json({ success: false, message: error.message || "Server error" });
  }
};

exports.deletePrivateExam = async (req, res) => {
  try {
    const exam = await PrivateExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const hasAssignments = await ExamAssignment.exists({ examId: exam._id });
    if (hasAssignments) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete exam after assignment. Disable or keep as completed record.",
      });
    }

    const imagePublicIds = getQuestionImagePublicIds(exam.questions);
    await PrivateExam.findByIdAndDelete(exam._id);
    await deleteUnusedQuestionImages(imagePublicIds, exam._id);
    return res.status(200).json({ success: true, message: "Private exam deleted" });
  } catch (error) {
    console.error("Delete private exam error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getPrivateExams = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { quizId: { $regex: req.query.search, $options: "i" } },
      ];
    }
    if (req.query.status && ["SCHEDULED", "COMPLETED"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [total, exams] = await Promise.all([
      PrivateExam.countDocuments(filter),
      PrivateExam.find(filter)
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const examIds = exams.map((e) => e._id);
    const assignmentAgg = await ExamAssignment.aggregate([
      { $match: { examId: { $in: examIds } } },
      {
        $group: {
          _id: "$examId",
          assignedCount: { $sum: 1 },
          startedCount: { $sum: { $cond: [{ $eq: ["$status", "STARTED"] }, 1, 0] } },
          submittedCount: { $sum: { $cond: [{ $eq: ["$status", "SUBMITTED"] }, 1, 0] } },
          missedCount: { $sum: { $cond: [{ $eq: ["$status", "MISSED"] }, 1, 0] } },
        },
      },
    ]);
    const map = new Map(assignmentAgg.map((a) => [String(a._id), a]));

    const now = Date.now();
    const response = exams.map((exam) => {
      const s = new Date(exam.startTime).getTime();
      const e = new Date(exam.endTime).getTime();
      const computedState = now < s ? "UPCOMING" : now <= e ? "ACTIVE" : "COMPLETED";
      const a = map.get(String(exam._id));
      return {
        ...exam,
        computedState,
        assignedCount: a?.assignedCount || 0,
        startedCount: a?.startedCount || 0,
        submittedCount: a?.submittedCount || 0,
        missedCount: a?.missedCount || 0,
      };
    });

    return res.status(200).json({
      success: true,
      exams: response,
      pagination: { currentPage: page, totalPages: Math.ceil(total / limit), total, limit },
    });
  } catch (error) {
    console.error("Get private exams error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.assignPrivateExam = async (req, res) => {
  try {
    const { userIds = [] } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: "userIds array is required." });
    }

    const exam = await PrivateExam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const users = await User.find({
      _id: { $in: userIds },
      isActive: true,
      isSuspended: false,
      isVerified: true,
    })
      .select("_id name email")
      .lean();

    if (!users.length) {
      return res.status(400).json({ success: false, message: "No valid users found to assign." });
    }

    const assignmentOps = users.map((user) => ({
      updateOne: {
        filter: { examId: exam._id, userId: user._id },
        update: {
          $setOnInsert: {
            examId: exam._id,
            userId: user._id,
            status: "ASSIGNED",
            startedAt: null,
            submittedAt: null,
            score: null,
            resultRef: null,
          },
        },
        upsert: true,
      },
    }));
    await ExamAssignment.bulkWrite(assignmentOps, { ordered: false });

    const examLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/private-exams/${exam._id}`;
    const notificationDocs = users.map((user) => ({
      userId: user._id,
      type: "PRIVATE_EXAM_ASSIGNED",
      title: "Private Exam Assigned",
      message: `${exam.title} has been assigned to you.`,
      link: examLink,
      isRead: false,
    }));
    await Notification.insertMany(notificationDocs);

    // Fire-and-forget email notifications, do not fail assignment if one mail fails.
    await Promise.all(
      users.map(async (user) => {
        try {
          await sendPrivateExamAssignedEmail({
            to: user.email,
            name: user.name,
            examTitle: exam.title,
            startTime: exam.startTime,
            endTime: exam.endTime,
            examLink,
          });
        } catch (mailErr) {
          console.error(`Email send failed for ${user.email}:`, mailErr.message);
        }
      })
    );

    return res.status(200).json({
      success: true,
      message: `Assigned exam to ${users.length} users.`,
      assignedCount: users.length,
    });
  } catch (error) {
    console.error("Assign private exam error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
