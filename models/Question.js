// models/Question.js
const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema(
  {
    quizId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String },
    level: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Easy",
    },
    timeLimit: { type: Number, required: true },
    passMarks: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    technologies: [
      {
        type: String,
        trim: true,
        required: true,
      },
    ],
    questions: [
      {
        questionText: { type: String, required: true },
        imageUrl: { type: String, default: "" },
        imagePublicId: { type: String, default: "" },
        imageAlt: { type: String, default: "" },
        codeSnippet: { type: String, default: "" },
        codeLanguage: { type: String, default: "" },
        options: [{ type: String, required: true }],
        correctAnswer: { type: String, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
    },
    isPublished: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

QuestionSchema.pre("save", function (next) {
  this.totalQuestions = Array.isArray(this.questions) ? this.questions.length : 0;
  next();
});

module.exports = mongoose.model("QuestionSet", QuestionSchema);
