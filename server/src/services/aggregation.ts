import { format, subDays, differenceInDays, startOfDay, endOfDay } from "date-fns";
import Redis from "ioredis";
import pino from "pino";

import { Metric } from "../models/Metric.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// ─── Redis Cache ─────────────────────────────────────────────

let redis: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.warn({ err: err.message }, "Redis connection error — falling back to uncached queries");
  });

  await redis.connect().catch(() => {
    logger.warn("Redis unavailable — caching disabled");
    redis = null;
  });
} catch {
  logger.warn("Redis unavailable — caching disabled");
  redis = null;
}

const CACHE_TTL = 120; // seconds

async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: unknown, ttl = CACHE_TTL): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttl);
  } catch {
    // Silently fail — caching is best-effort
  }
}

// ─── Types ───────────────────────────────────────────────────

interface TimeSeriesParams {
  startDate: Date;
  endDate: Date;
  granularity: "hour" | "day" | "week" | "month";
  metrics: string[];
  source?: string;
}

interface AggregatedRow {
  date: string;
  [metric: string]: string | number;
}

interface KPIItem {
  id: string;
  label: string;
  value: number;
  previousValue: number;
  format: "number" | "currency" | "percentage" | "duration";
  trend: { date: string; value: number }[];
}

interface KPIResponse {
  kpis: KPIItem[];
  period: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
}

// ─── Metric Configuration ────────────────────────────────────

const METRIC_CONFIG: Record<string, {
  label: string;
  format: KPIItem["format"];
  aggregation: "sum" | "avg";
}> = {
  revenue: { label: "Revenue", format: "currency", aggregation: "sum" },
  sessions: { label: "Sessions", format: "number", aggregation: "sum" },
  conversions: { label: "Conversions", format: "number", aggregation: "sum" },
  bounce_rate: { label: "Bounce Rate", format: "percentage", aggregation: "avg" },
  avg_session_duration: { label: "Avg. Session Duration", format: "duration", aggregation: "avg" },
  active_users: { label: "Active Users", format: "number", aggregation: "sum" },
  page_views: { label: "Page Views", format: "number", aggregation: "sum" },
  new_users: { label: "New Users", format: "number", aggregation: "sum" },
};

// ─── Date Grouping Expressions ───────────────────────────────

function getDateGroup(granularity: string) {
  switch (granularity) {
    case "hour":
      return {
        $dateToString: { format: "%Y-%m-%dT%H:00:00", date: "$timestamp" },
      };
    case "week":
      return {
        $dateToString: {
          format: "%Y-%m-%d",
          date: { $dateFromParts: { isoWeekYear: { $isoWeekYear: "$timestamp" }, isoWeek: { $isoWeek: "$timestamp" }, isoDayOfWeek: 1 } },
        },
      };
    case "month":
      return {
        $dateToString: { format: "%Y-%m-01", date: "$timestamp" },
      };
    case "day":
    default:
      return {
        $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
      };
  }
}

// ─── Service Class ───────────────────────────────────────────

export class AggregationService {
  /**
   * Retrieves time-series data for one or more metrics, grouped by the
   * specified granularity. Results are cached in Redis.
   */
  async getTimeSeries(params: TimeSeriesParams): Promise<AggregatedRow[]> {
    const { startDate, endDate, granularity, metrics, source } = params;

    const cacheKey = `ts:${metrics.join(",")}:${granularity}:${format(startDate, "yyyyMMdd")}-${format(endDate, "yyyyMMdd")}:${source ?? "all"}`;
    const cached = await getCached<AggregatedRow[]>(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, "Cache hit for time series");
      return cached;
    }

    // Build a single aggregation pipeline that pivots all requested metrics
    // into columns per date bucket.
    const matchStage: Record<string, unknown> = {
      name: { $in: metrics },
      timestamp: { $gte: startOfDay(startDate), $lte: endOfDay(endDate) },
    };

    if (source) {
      matchStage.source = source;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: getDateGroup(granularity),
            metric: "$name",
          },
          value: { $sum: "$value" },
        },
      },
      { $sort: { "_id.date": 1 as const } },
      {
        $group: {
          _id: "$_id.date",
          metrics: {
            $push: { k: "$_id.metric", v: "$value" },
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              { date: "$_id" },
              { $arrayToObject: "$metrics" },
            ],
          },
        },
      },
      { $sort: { date: 1 as const } },
    ];

    const results = await Metric.aggregate(pipeline);

    // Ensure every row has all requested metrics (fill missing with 0)
    const rows: AggregatedRow[] = results.map((row: Record<string, unknown>) => {
      const normalized: AggregatedRow = { date: row.date as string };
      metrics.forEach((m) => {
        normalized[m] = (row[m] as number) ?? 0;
      });
      return normalized;
    });

    await setCache(cacheKey, rows);
    return rows;
  }

  /**
   * Computes KPI values for the current period and the equivalent previous
   * period, along with a daily trend for sparkline rendering.
   */
  async getKPIs(startDate: Date, endDate: Date): Promise<KPIResponse> {
    const periodLength = differenceInDays(endDate, startDate);
    const prevStart = subDays(startDate, periodLength);
    const prevEnd = subDays(endDate, periodLength);

    const cacheKey = `kpi:${format(startDate, "yyyyMMdd")}-${format(endDate, "yyyyMMdd")}`;
    const cached = await getCached<KPIResponse>(cacheKey);
    if (cached) return cached;

    const kpiMetrics = Object.keys(METRIC_CONFIG);

    // Run all metric aggregations in parallel
    const [currentResults, previousResults, trendResults] = await Promise.all([
      this.aggregatePeriod(kpiMetrics, startDate, endDate),
      this.aggregatePeriod(kpiMetrics, prevStart, prevEnd),
      this.getTrends(kpiMetrics, startDate, endDate),
    ]);

    const kpis: KPIItem[] = kpiMetrics.map((metricName) => {
      const config = METRIC_CONFIG[metricName]!;
      return {
        id: metricName,
        label: config.label,
        value: currentResults[metricName] ?? 0,
        previousValue: previousResults[metricName] ?? 0,
        format: config.format,
        trend: trendResults[metricName] ?? [],
      };
    });

    const response: KPIResponse = {
      kpis,
      period: {
        current: {
          start: format(startDate, "yyyy-MM-dd"),
          end: format(endDate, "yyyy-MM-dd"),
        },
        previous: {
          start: format(prevStart, "yyyy-MM-dd"),
          end: format(prevEnd, "yyyy-MM-dd"),
        },
      },
    };

    await setCache(cacheKey, response, 300); // Cache KPIs for 5 minutes
    return response;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  private async aggregatePeriod(
    metrics: string[],
    start: Date,
    end: Date,
  ): Promise<Record<string, number>> {
    const results = await Metric.aggregate([
      {
        $match: {
          name: { $in: metrics },
          timestamp: { $gte: startOfDay(start), $lte: endOfDay(end) },
        },
      },
      {
        $group: {
          _id: "$name",
          sum: { $sum: "$value" },
          avg: { $avg: "$value" },
        },
      },
    ]);

    const map: Record<string, number> = {};
    results.forEach((r: { _id: string; sum: number; avg: number }) => {
      const config = METRIC_CONFIG[r._id];
      map[r._id] = config?.aggregation === "avg" ? r.avg : r.sum;
    });

    return map;
  }

  private async getTrends(
    metrics: string[],
    start: Date,
    end: Date,
  ): Promise<Record<string, { date: string; value: number }[]>> {
    const results = await Metric.aggregate([
      {
        $match: {
          name: { $in: metrics },
          timestamp: { $gte: startOfDay(start), $lte: endOfDay(end) },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            metric: "$name",
          },
          value: { $sum: "$value" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    const trendMap: Record<string, { date: string; value: number }[]> = {};

    results.forEach((r: { _id: { date: string; metric: string }; value: number }) => {
      if (!trendMap[r._id.metric]) {
        trendMap[r._id.metric] = [];
      }
      trendMap[r._id.metric]!.push({ date: r._id.date, value: r.value });
    });

    return trendMap;
  }
}
