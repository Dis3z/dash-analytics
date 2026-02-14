import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";

import type {
  MetricFilter,
  MetricResponse,
  KPIResponse,
  KPIData,
  TimeSeriesData,
  DataPoint,
  ApiError,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("da_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Fetch functions ─────────────────────────────────────────

async function fetchMetrics(filters: MetricFilter): Promise<MetricResponse> {
  const { data } = await api.get<MetricResponse>("/analytics/metrics", {
    params: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      granularity: filters.granularity,
      metrics: filters.metrics.join(","),
      ...(filters.source ? { source: filters.source } : {}),
    },
  });
  return data;
}

async function fetchKPIs(
  startDate: string,
  endDate: string,
): Promise<KPIResponse> {
  const { data } = await api.get<KPIResponse>("/analytics/kpi", {
    params: { startDate, endDate },
  });
  return data;
}

// ─── Color palette for metric series ─────────────────────────

const METRIC_COLORS: Record<string, string> = {
  revenue: "#6366f1",
  sessions: "#06b6d4",
  conversions: "#10b981",
  bounce_rate: "#f59e0b",
  avg_session_duration: "#8b5cf6",
  active_users: "#ec4899",
  page_views: "#3b82f6",
  new_users: "#14b8a6",
};

const METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue",
  sessions: "Sessions",
  conversions: "Conversions",
  bounce_rate: "Bounce Rate",
  avg_session_duration: "Avg. Duration",
  active_users: "Active Users",
  page_views: "Page Views",
  new_users: "New Users",
};

// ─── Hook ────────────────────────────────────────────────────

interface UseAnalyticsReturn {
  kpis: KPIData[];
  timeSeries: TimeSeriesData[];
  barData: DataPoint[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

export function useAnalytics(filters: MetricFilter): UseAnalyticsReturn {
  const {
    data: metricsData,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["metrics", filters],
    queryFn: () => fetchMetrics(filters),
    staleTime: 2 * 60 * 1000,
    enabled: filters.metrics.length > 0,
  });

  const {
    data: kpiData,
    isLoading: kpiLoading,
    error: kpiError,
  } = useQuery({
    queryKey: ["kpis", filters.startDate, filters.endDate],
    queryFn: () => fetchKPIs(filters.startDate, filters.endDate),
    staleTime: 5 * 60 * 1000,
  });

  // Transform metrics response into chart-ready time series
  const timeSeries: TimeSeriesData[] = useMemo(() => {
    if (!metricsData?.data) return [];

    return filters.metrics
      .filter((metric) => metric !== "page_views") // page_views goes to bar chart
      .map((metric) => ({
        metric,
        label: METRIC_LABELS[metric] ?? metric,
        color: METRIC_COLORS[metric] ?? "#6366f1",
        data: metricsData.data.map((row) => ({
          date: row.date as string,
          value: (row[metric] as number) ?? 0,
        })),
      }));
  }, [metricsData, filters.metrics]);

  // Extract page_views as bar chart data
  const barData: DataPoint[] = useMemo(() => {
    if (!metricsData?.data) return [];

    return metricsData.data.map((row) => ({
      date: row.date as string,
      value: (row.page_views as number) ?? 0,
    }));
  }, [metricsData]);

  // KPIs with fallback
  const kpis: KPIData[] = useMemo(() => {
    return kpiData?.kpis ?? [];
  }, [kpiData]);

  // Normalize error
  const rawError = metricsError ?? kpiError;
  const error: ApiError | null = useMemo(() => {
    if (!rawError) return null;
    if (rawError instanceof AxiosError && rawError.response?.data) {
      return rawError.response.data as ApiError;
    }
    return {
      message: (rawError as Error).message ?? "An unexpected error occurred",
      code: "UNKNOWN",
      status: 500,
    };
  }, [rawError]);

  return {
    kpis,
    timeSeries,
    barData,
    isLoading: metricsLoading || kpiLoading,
    error,
    refetch: refetchMetrics,
  };
}
