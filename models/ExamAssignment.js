const mongoose = require("mongoose");

const examAssignmentSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PrivateExam",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ASSIGNED", "STARTED", "SUBMITTED", "MISSED"],
      default: "ASSIGNED",
      index: true,
    },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    score: { type: Number, default: null },
    resultRef: { type: mongoose.Schema.Types.ObjectId, ref: "Result", default: null },
  },
  { timestamps: true }
);

examAssignmentSchema.index({ examId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ExamAssignment", examAssignmentSchema);
