const mongoose = require("mongoose");

const privateExamSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    quizId: { type: String, required: true, unique: true, trim: true },
    timeLimit: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, required: true, min: 0 },
    level: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Easy",
    },
    technologies: [{ type: String, trim: true }],
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
    startTime: { type: Date, required: true, index: true }, // Stored in UTC
    endTime: { type: Date, required: true, index: true }, // Stored in UTC
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["SCHEDULED", "COMPLETED"],
      default: "SCHEDULED",
      index: true,
    },
  },
  { timestamps: true }
);

privateExamSchema.index({ startTime: 1, endTime: 1 });

module.exports = mongoose.model("PrivateExam", privateExamSchema);
