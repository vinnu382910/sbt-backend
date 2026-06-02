const User = require("../models/User");
const QuestionSet = require("../models/Question");
const Result = require("../models/Result");
const PrivateExam = require("../models/PrivateExam");
const {
  uploadQuestionImage: uploadQuestionImageToCloudinary,
  deleteImage,
} = require("../utils/cloudinaryService");

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

const deleteUnusedQuestionImages = async (publicIds = [], excludeQuizId = null) => {
  const uniqueIds = [...new Set(publicIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  await Promise.all(
    uniqueIds.map(async (publicId) => {
      try {
        const sharedFilter = { "questions.imagePublicId": publicId };
        if (excludeQuizId) sharedFilter._id = { $ne: excludeQuizId };
        const [usedByPublicQuiz, usedByPrivateExam] = await Promise.all([
          QuestionSet.exists(sharedFilter),
          PrivateExam.exists({ "questions.imagePublicId": publicId }),
        ]);
        if (!usedByPublicQuiz && !usedByPrivateExam) await deleteImage(publicId);
      } catch (error) {
        console.error(`Cloudinary cleanup failed for ${publicId}:`, error.message);
      }
    })
  );
};

const findRemovedQuestionImages = (oldQuestions = [], newQuestions = []) => {
  const nextIds = new Set(getQuestionImagePublicIds(newQuestions));
  return getQuestionImagePublicIds(oldQuestions).filter((publicId) => !nextIds.has(publicId));
};

const applyLifecycle = (payload) => {
  const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(payload.status)
    ? payload.status
    : "DRAFT";

  payload.status = status;
  if (status === "PUBLISHED") {
    payload.isPublished = true;
    payload.isActive = true;
  } else {
    payload.isPublished = false;
    payload.isActive = false;
  }
  return payload;
};

const hasAttempts = async (quizId) => {
  const count = await Result.countDocuments({ quizId });
  return count > 0;
};

exports.uploadQuestionImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image file is required." });
    }

    const uploaded = await uploadQuestionImageToCloudinary({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
    });

    return res.status(201).json({ success: true, ...uploaded });
  } catch (error) {
    console.error("Question image upload error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to upload question image." });
  }
};

exports.deleteQuestionImage = async (req, res) => {
  try {
    const publicId = String(req.body.publicId || "").trim();
    if (!publicId) {
      return res.status(400).json({ success: false, message: "publicId is required." });
    }

    await deleteImage(publicId);
    return res.status(200).json({ success: true, message: "Question image deleted." });
  } catch (error) {
    console.error("Question image delete error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to delete question image." });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, activeUsers, suspendedUsers, totalQuizzes, totalAttempts] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ isSuspended: true }),
        QuestionSet.countDocuments(),
        Result.countDocuments(),
      ]);

    const [passAgg, quizAttemptAgg, failByQuizAgg] = await Promise.all([
      Result.aggregate([
        {
          $group: {
            _id: null,
            passCount: { $sum: { $cond: ["$pass", 1, 0] } },
            total: { $sum: 1 },
          },
        },
      ]),
      Result.aggregate([
        { $group: { _id: "$quizId", attempts: { $sum: 1 } } },
        { $sort: { attempts: -1 } },
        { $limit: 1 },
      ]),
      Result.aggregate([
        { $match: { pass: false } },
        { $group: { _id: "$quizId", fails: { $sum: 1 } } },
        { $sort: { fails: -1 } },
        { $limit: 1 },
      ]),
    ]);

    const passRate = passAgg[0]?.total
      ? Number(((passAgg[0].passCount / passAgg[0].total) * 100).toFixed(2))
      : 0;

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalQuizzes,
        totalAttempts,
        passRate,
        mostAttemptedQuizId: quizAttemptAgg[0]?._id || null,
        mostFailedQuizId: failByQuizAgg[0]?._id || null,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { search, role, isActive, isSuspended } = req.query;
    const { page, limit, skip } = parsePaging(req.query);

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role && ["USER", "ADMIN", "SUPER_ADMIN"].includes(role)) filter.role = role;
    if (isActive === "true" || isActive === "false") filter.isActive = isActive === "true";
    if (isSuspended === "true" || isSuspended === "false") filter.isSuspended = isSuspended === "true";

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("name email role isActive isSuspended lastLogin createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        limit,
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, isSuspended } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (typeof isActive === "boolean") user.isActive = isActive;
    if (typeof isSuspended === "boolean") user.isSuspended = isSuspended;

    await user.save();
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isSuspended: user.isSuspended,
      },
    });
  } catch (error) {
    console.error("Update user status error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getQuizzes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { quizId: { $regex: req.query.search, $options: "i" } },
      ];
    }
    if (req.query.status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.isActive === "true" || req.query.isActive === "false") {
      filter.isActive = req.query.isActive === "true";
    }

    const [total, quizzes] = await Promise.all([
      QuestionSet.countDocuments(filter),
      QuestionSet.find(filter)
        .select(
          "quizId title description level timeLimit passMarks totalQuestions technologies questions status isPublished isActive version createdBy createdAt updatedAt"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const attemptAgg = await Result.aggregate([
      { $match: { quizId: { $in: quizzes.map((q) => q.quizId) } } },
      { $group: { _id: "$quizId", attempts: { $sum: 1 } } },
    ]);
    const attemptsMap = new Map(attemptAgg.map((item) => [item._id, item.attempts]));

    const enriched = quizzes.map((quiz) => ({
      ...quiz,
      attemptsCount: attemptsMap.get(quiz.quizId) || 0,
    }));

    return res.status(200).json({
      success: true,
      quizzes: enriched,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        limit,
      },
    });
  } catch (error) {
    console.error("Get admin quizzes error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createQuiz = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      createdBy: req.user.id,
    };

    if (!payload.title) {
      return res.status(400).json({ success: false, message: "title is required." });
    }

    payload.quizId = String(payload.quizId || "").trim() || toSlug(payload.title);
    if (!payload.quizId) {
      return res.status(400).json({ success: false, message: "quizId could not be generated." });
    }

    payload.questions = normalizeQuestionPayload(payload.questions || []);
    payload.totalQuestions = payload.questions.length;
    payload.version = 1;

    applyLifecycle(payload);
    if (payload.status === "PUBLISHED" && payload.totalQuestions === 0) {
      return res.status(400).json({ success: false, message: "Published quiz must have questions." });
    }

    const quiz = await QuestionSet.create(payload);
    return res.status(201).json({ success: true, quiz });
  } catch (error) {
    console.error("Create quiz error:", error);
    const message = error?.message || "Server error";
    const status = message.includes("Question") || message.includes("required") ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
};

exports.updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await QuestionSet.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Quiz not found" });

    const updates = { ...req.body };
    const attemptsExist = await hasAttempts(existing.quizId);

    if (updates.questions !== undefined) {
      if (attemptsExist) {
        return res.status(400).json({
          success: false,
          message: "Cannot edit questions of an exam that already has attempts.",
        });
      }
      updates.questions = normalizeQuestionPayload(updates.questions);
      updates._removedQuestionImagePublicIds = findRemovedQuestionImages(
        existing.questions,
        updates.questions
      );
      updates.totalQuestions = updates.questions.length;
      updates.version = (existing.version || 1) + 1;
    }

    const statusWasProvided = Object.prototype.hasOwnProperty.call(updates, "status");
    const nextStatus = statusWasProvided ? updates.status : existing.status;

    if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: "Invalid quiz status." });
    }

    if (statusWasProvided) {
      updates.status = nextStatus;
      if (nextStatus === "PUBLISHED") {
        updates.isPublished = true;
        if (typeof updates.isActive !== "boolean") updates.isActive = true;
      } else {
        updates.isPublished = false;
        updates.isActive = false;
      }
    } else if (nextStatus === "PUBLISHED") {
      updates.isPublished = true;
      if (typeof updates.isActive !== "boolean") {
        updates.isActive = existing.isActive;
      }
    } else if (nextStatus === "ARCHIVED") {
      updates.isPublished = false;
      updates.isActive = false;
    } else {
      updates.isPublished = false;
      updates.isActive = false;
    }

    if ((updates.status || existing.status) === "PUBLISHED") {
      const finalCount = updates.totalQuestions ?? existing.totalQuestions;
      if (!finalCount || finalCount <= 0) {
        return res.status(400).json({ success: false, message: "Published quiz must have questions." });
      }
    }

    const removedImagePublicIds = updates._removedQuestionImagePublicIds || [];
    delete updates._removedQuestionImagePublicIds;

    const quiz = await QuestionSet.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    await deleteUnusedQuestionImages(removedImagePublicIds, quiz._id);
    return res.status(200).json({ success: true, quiz });
  } catch (error) {
    console.error("Update quiz error:", error);
    const message = error?.message || "Server error";
    const status = message.includes("Question") || message.includes("required") ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
};

exports.archiveQuiz = async (req, res) => {
  try {
    const quiz = await QuestionSet.findByIdAndUpdate(
      req.params.id,
      { status: "ARCHIVED", isPublished: false, isActive: false },
      { new: true }
    );
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    return res.status(200).json({ success: true, quiz, message: "Quiz archived" });
  } catch (error) {
    console.error("Archive quiz error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.cloneQuiz = async (req, res) => {
  try {
    const source = await QuestionSet.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ success: false, message: "Quiz not found" });

    const copy = {
      ...source,
      _id: undefined,
      id: undefined,
      title: `${source.title} (Clone)`,
      quizId: `${source.quizId}-clone-${Date.now().toString().slice(-6)}`,
      status: "DRAFT",
      isPublished: false,
      isActive: false,
      version: 1,
      createdAt: undefined,
      updatedAt: undefined,
    };

    const quiz = await QuestionSet.create(copy);
    return res.status(201).json({ success: true, quiz, message: "Quiz cloned" });
  } catch (error) {
    console.error("Clone quiz error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createQuizVersion = async (req, res) => {
  try {
    const source = await QuestionSet.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ success: false, message: "Quiz not found" });
    if (source.status !== "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "New version can only be created from a published quiz.",
      });
    }

    const nextVersion = (source.version || 1) + 1;
    const baseQuizId = `${source.quizId}-v${nextVersion}`;
    let nextQuizId = baseQuizId;
    let counter = 1;

    // Ensure unique quizId even if multiple versions are created quickly.
    while (await QuestionSet.exists({ quizId: nextQuizId })) {
      nextQuizId = `${baseQuizId}-${counter}`;
      counter += 1;
    }

    const copy = {
      ...source,
      _id: undefined,
      id: undefined,
      title: `${source.title} (v${nextVersion})`,
      quizId: nextQuizId,
      status: "DRAFT",
      isPublished: false,
      isActive: false,
      version: nextVersion,
      createdAt: undefined,
      updatedAt: undefined,
    };

    const quiz = await QuestionSet.create(copy);
    return res.status(201).json({ success: true, quiz, message: "New quiz version created" });
  } catch (error) {
    console.error("Create quiz version error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteQuiz = async (req, res) => {
  try {
    const quiz = await QuestionSet.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    if (!["DRAFT", "ARCHIVED"].includes(quiz.status)) {
      return res.status(400).json({
        success: false,
        message: "Only DRAFT or ARCHIVED quizzes can be permanently deleted. Archive published quizzes first.",
      });
    }

    if (await hasAttempts(quiz.quizId)) {
      return res.status(400).json({ success: false, message: "Cannot delete quiz with attempts." });
    }

    const imagePublicIds = getQuestionImagePublicIds(quiz.questions);
    await QuestionSet.findByIdAndDelete(req.params.id);
    await deleteUnusedQuestionImages(imagePublicIds, quiz._id);
    return res.status(200).json({ success: true, message: "Quiz deleted" });
  } catch (error) {
    console.error("Delete quiz error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getResults = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};

    if (req.query.quizId) filter.quizId = req.query.quizId;
    if (req.query.pass === "true" || req.query.pass === "false") filter.pass = req.query.pass === "true";
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.minScore || req.query.maxScore) {
      filter.score = {};
      if (req.query.minScore) filter.score.$gte = Number(req.query.minScore);
      if (req.query.maxScore) filter.score.$lte = Number(req.query.maxScore);
    }
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.date.$lte = new Date(req.query.endDate);
    }

    const [total, results] = await Promise.all([
      Result.countDocuments(filter),
      Result.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      results,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        limit,
      },
    });
  } catch (error) {
    console.error("Admin results error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
