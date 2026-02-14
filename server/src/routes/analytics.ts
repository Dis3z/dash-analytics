import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

import { AggregationService } from "../services/aggregation.js";
import { Metric } from "../models/Metric.js";
import { Report } from "../models/Report.js";

const router = Router();
const aggregationService = new AggregationService();

// ─── Validation Schemas ──────────────────────────────────────

const metricsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
  metrics: z.string().min(1, "At least one metric is required"),
  source: z.string().optional(),
});

const reportBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  metrics: z.array(z.string()).min(1, "At least one metric is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
  format: z.enum(["pdf", "csv"]).default("pdf"),
  schedule: z.enum(["once", "daily", "weekly", "monthly"]).default("once"),
});

// ─── Helper: Validate with Zod ───────────────────────────────

function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const target = req.method === "GET" ? req.query : req.body;
    const result = schema.safeParse(target);

    if (!result.success) {
      const details: Record<string, string[]> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path.join(".");
        if (!details[key]) details[key] = [];
        details[key]!.push(issue.message);
      });

      return _res.status(400).json({
        error: {
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          status: 400,
          details,
        },
      });
    }

    (req as Request & { validated: T }).validated = result.data;
    next();
  };
}

// ─── GET /metrics ────────────────────────────────────────────
// Returns time-series data for the requested metrics.

router.get(
  "/metrics",
  validate(metricsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate, granularity, metrics, source } = (
        req as Request & { validated: z.infer<typeof metricsQuerySchema> }
      ).validated;

      const metricNames = metrics.split(",").map((m) => m.trim());

      const data = await aggregationService.getTimeSeries({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        granularity,
        metrics: metricNames,
        source,
      });

      res.json({
        data,
        meta: {
          total: data.length,
          granularity,
          startDate,
          endDate,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /kpi ────────────────────────────────────────────────
// Returns KPI summary with period-over-period comparison.

router.get("/kpi", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: {
          message: "startDate and endDate are required",
          code: "VALIDATION_ERROR",
          status: 400,
        },
      });
    }

    const kpis = await aggregationService.getKPIs(
      new Date(startDate),
      new Date(endDate),
    );

    res.json(kpis);
  } catch (err) {
    next(err);
  }
});

// ─── GET /top-pages ──────────────────────────────────────────

router.get(
  "/top-pages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const pages = await Metric.aggregate([
        {
          $match: {
            name: "page_views",
            timestamp: {
              $gte: new Date(startDate),
              $lte: new Date(endDate),
            },
          },
        },
        {
          $group: {
            _id: "$metadata.page",
            views: { $sum: "$value" },
            avgDuration: { $avg: "$metadata.duration" },
          },
        },
        { $sort: { views: -1 } },
        { $limit: limit },
        {
          $project: {
            page: "$_id",
            views: 1,
            avgDuration: { $round: ["$avgDuration", 1] },
            _id: 0,
          },
        },
      ]);

      res.json({ data: pages });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /reports ───────────────────────────────────────────
// Create a report (one-time or scheduled).

router.post(
  "/reports",
  validate(reportBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (
        req as Request & { validated: z.infer<typeof reportBodySchema> }
      ).validated;

      const report = await Report.create({
        title: body.title,
        description: body.description,
        metrics: body.metrics,
        filters: {
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          granularity: body.granularity,
        },
        format: body.format,
        schedule: body.schedule,
        status: "pending",
        createdBy: (req as Request & { userId: string }).userId,
      });

      // TODO: enqueue report generation job via Bull queue
      // await reportQueue.add('generate', { reportId: report.id });

      res.status(201).json({
        data: report,
        message: "Report created successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /reports ────────────────────────────────────────────

router.get(
  "/reports",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      const userId = (req as Request & { userId: string }).userId;

      const [reports, total] = await Promise.all([
        Report.find({ createdBy: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Report.countDocuments({ createdBy: userId }),
      ]);

      res.json({
        data: reports,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /reports/:id/export ─────────────────────────────────

router.get(
  "/reports/:id/export",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await Report.findById(req.params.id).lean();

      if (!report) {
        return res.status(404).json({
          error: {
            message: "Report not found",
            code: "NOT_FOUND",
            status: 404,
          },
        });
      }

      if (report.status !== "completed" || !report.downloadUrl) {
        return res.status(409).json({
          error: {
            message: `Report is not ready for export (status: ${report.status})`,
            code: "REPORT_NOT_READY",
            status: 409,
          },
        });
      }

      // Redirect to the stored file URL (S3 presigned URL or local path)
      res.redirect(report.downloadUrl);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
