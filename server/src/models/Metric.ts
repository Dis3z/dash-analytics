import mongoose, { Schema, type InferSchemaType } from "mongoose";

// ─── Schema ──────────────────────────────────────────────────

const metricSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      index: true,
      enum: [
        "revenue",
        "sessions",
        "conversions",
        "bounce_rate",
        "avg_session_duration",
        "active_users",
        "page_views",
        "new_users",
      ],
    },
    value: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    source: {
      type: String,
      default: "default",
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "metrics",
    // Optimise for time-series queries
    timeseries: {
      timeField: "timestamp",
      metaField: "metadata",
      granularity: "hours",
    },
  },
);

// ─── Compound Indexes ────────────────────────────────────────

metricSchema.index({ name: 1, timestamp: -1 });
metricSchema.index({ name: 1, source: 1, timestamp: -1 });
metricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 }); // TTL: 2 years

// ─── Static Methods ──────────────────────────────────────────

metricSchema.statics.findByTimeRange = function (
  name: string,
  start: Date,
  end: Date,
  source?: string,
) {
  const filter: Record<string, unknown> = {
    name,
    timestamp: { $gte: start, $lte: end },
  };

  if (source) {
    filter.source = source;
  }

  return this.find(filter).sort({ timestamp: 1 }).lean();
};

metricSchema.statics.aggregateByGranularity = function (
  name: string,
  start: Date,
  end: Date,
  granularity: "hour" | "day" | "week" | "month",
) {
  const dateGroupExpression: Record<string, Record<string, unknown>> = {
    hour: {
      year: { $year: "$timestamp" },
      month: { $month: "$timestamp" },
      day: { $dayOfMonth: "$timestamp" },
      hour: { $hour: "$timestamp" },
    },
    day: {
      year: { $year: "$timestamp" },
      month: { $month: "$timestamp" },
      day: { $dayOfMonth: "$timestamp" },
    },
    week: {
      year: { $isoWeekYear: "$timestamp" },
      week: { $isoWeek: "$timestamp" },
    },
    month: {
      year: { $year: "$timestamp" },
      month: { $month: "$timestamp" },
    },
  };

  return this.aggregate([
    {
      $match: {
        name,
        timestamp: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: dateGroupExpression[granularity],
        avg: { $avg: "$value" },
        sum: { $sum: "$value" },
        min: { $min: "$value" },
        max: { $max: "$value" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

// ─── Type Export ──────────────────────────────────────────────

export type MetricDocument = InferSchemaType<typeof metricSchema>;

export const Metric = mongoose.model("Metric", metricSchema);
