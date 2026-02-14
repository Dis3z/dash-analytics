import mongoose, { Schema, type InferSchemaType, type Document } from "mongoose";

// ─── Schema ──────────────────────────────────────────────────

const reportSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    metrics: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "At least one metric is required",
      },
    },
    filters: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      granularity: {
        type: String,
        enum: ["hour", "day", "week", "month"],
        default: "day",
      },
      source: { type: String, default: null },
    },
    format: {
      type: String,
      enum: ["pdf", "csv"],
      default: "pdf",
    },
    schedule: {
      type: String,
      enum: ["once", "daily", "weekly", "monthly"],
      default: "once",
    },
    cronExpression: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    downloadUrl: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    error: {
      message: { type: String, default: null },
      stack: { type: String, default: null },
      occurredAt: { type: Date, default: null },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    lastGeneratedAt: {
      type: Date,
      default: null,
    },
    generationCount: {
      type: Number,
      default: 0,
    },
    recipients: {
      type: [String],
      default: [],
      validate: {
        validator: (emails: string[]) =>
          emails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
        message: "Invalid email address in recipients",
      },
    },
  },
  {
    timestamps: true,
    collection: "reports",
    toJSON: {
      transform(_doc: Document, ret: Record<string, unknown>) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Never expose error stack in JSON output
        if (ret.error && typeof ret.error === "object") {
          delete (ret.error as Record<string, unknown>).stack;
        }
        return ret;
      },
    },
  },
);

// ─── Indexes ─────────────────────────────────────────────────

reportSchema.index({ createdBy: 1, createdAt: -1 });
reportSchema.index({ status: 1, schedule: 1 });
reportSchema.index({ schedule: 1, lastGeneratedAt: 1 }); // For cron job queries

// ─── Pre-save Hook ───────────────────────────────────────────
// Automatically generate a cron expression from the schedule type.

reportSchema.pre("save", function (next) {
  if (this.isModified("schedule")) {
    const cronMap: Record<string, string | null> = {
      once: null,
      daily: "0 6 * * *", // Every day at 6:00 AM
      weekly: "0 6 * * 1", // Every Monday at 6:00 AM
      monthly: "0 6 1 * *", // First of each month at 6:00 AM
    };
    this.cronExpression = cronMap[this.schedule] ?? null;
  }
  next();
});

// ─── Instance Methods ────────────────────────────────────────

reportSchema.methods.markProcessing = function () {
  this.status = "processing";
  return this.save();
};

reportSchema.methods.markCompleted = function (
  downloadUrl: string,
  fileSize: number,
) {
  this.status = "completed";
  this.downloadUrl = downloadUrl;
  this.fileSize = fileSize;
  this.lastGeneratedAt = new Date();
  this.generationCount += 1;
  this.error = { message: null, stack: null, occurredAt: null };
  return this.save();
};

reportSchema.methods.markFailed = function (err: Error) {
  this.status = "failed";
  this.error = {
    message: err.message,
    stack: err.stack ?? null,
    occurredAt: new Date(),
  };
  return this.save();
};

// ─── Static Methods ──────────────────────────────────────────

reportSchema.statics.findPendingScheduled = function () {
  return this.find({
    schedule: { $ne: "once" },
    status: { $in: ["pending", "completed"] },
  }).lean();
};

// ─── Type Export ──────────────────────────────────────────────

export type ReportDocument = InferSchemaType<typeof reportSchema>;

export const Report = mongoose.model("Report", reportSchema);
