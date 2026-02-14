import { useMemo, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import { format, subDays } from "date-fns";

import LineChart from "../components/charts/LineChart";
import BarChart from "../components/charts/BarChart";
import PieChart from "../components/charts/PieChart";
import KPICard from "../components/KPICard";
import { useAnalytics } from "../hooks/useAnalytics";

import type { Granularity, PieSlice } from "../types";

const ResponsiveGridLayout = WidthProvider(Responsive);

const GRANULARITY_OPTIONS: { label: string; value: Granularity }[] = [
  { label: "Hourly", value: "hour" },
  { label: "Daily", value: "day" },
  { label: "Weekly", value: "week" },
  { label: "Monthly", value: "month" },
];

const DATE_RANGE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
] as const;

const defaultLayouts = {
  lg: [
    { i: "kpi-revenue", x: 0, y: 0, w: 3, h: 2 },
    { i: "kpi-sessions", x: 3, y: 0, w: 3, h: 2 },
    { i: "kpi-conversions", x: 6, y: 0, w: 3, h: 2 },
    { i: "kpi-bounce", x: 9, y: 0, w: 3, h: 2 },
    { i: "line-chart", x: 0, y: 2, w: 8, h: 5 },
    { i: "pie-chart", x: 8, y: 2, w: 4, h: 5 },
    { i: "bar-chart", x: 0, y: 7, w: 12, h: 5 },
  ],
  md: [
    { i: "kpi-revenue", x: 0, y: 0, w: 3, h: 2 },
    { i: "kpi-sessions", x: 3, y: 0, w: 3, h: 2 },
    { i: "kpi-conversions", x: 6, y: 0, w: 3, h: 2 },
    { i: "kpi-bounce", x: 0, y: 2, w: 3, h: 2 },
    { i: "line-chart", x: 0, y: 4, w: 6, h: 5 },
    { i: "pie-chart", x: 6, y: 4, w: 3, h: 5 },
    { i: "bar-chart", x: 0, y: 9, w: 9, h: 5 },
  ],
};

export default function Dashboard() {
  const [rangeDays, setRangeDays] = useState(30);
  const [granularity, setGranularity] = useState<Granularity>("day");

  const dateRange = useMemo(
    () => ({
      startDate: format(subDays(new Date(), rangeDays), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
    }),
    [rangeDays],
  );

  const { kpis, timeSeries, barData, isLoading, error } = useAnalytics({
    ...dateRange,
    granularity,
    metrics: [
      "revenue",
      "sessions",
      "conversions",
      "bounce_rate",
      "page_views",
    ],
  });

  const trafficSources: PieSlice[] = useMemo(
    () => [
      { label: "Organic Search", value: 42.3, color: "#6366f1" },
      { label: "Direct", value: 24.1, color: "#06b6d4" },
      { label: "Social Media", value: 18.7, color: "#f59e0b" },
      { label: "Referral", value: 10.2, color: "#10b981" },
      { label: "Email", value: 4.7, color: "#ef4444" },
    ],
    [],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h3 className="text-lg font-semibold text-red-800">
            Failed to load dashboard
          </h3>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {dateRange.startDate} &mdash; {dateRange.endDate}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range presets */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {DATE_RANGE_PRESETS.map((preset) => (
              <button
                key={preset.days}
                onClick={() => setRangeDays(preset.days)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  rangeDays === preset.days
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Granularity selector */}
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {GRANULARITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Export button */}
          <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <ResponsiveGridLayout
        className="layout"
        layouts={defaultLayouts}
        breakpoints={{ lg: 1200, md: 768 }}
        cols={{ lg: 12, md: 9 }}
        rowHeight={60}
        isDraggable
        isResizable
        compactType="vertical"
        containerPadding={[0, 0]}
        margin={[16, 16]}
      >
        {/* KPI Cards */}
        {kpis.map((kpi) => (
          <div key={`kpi-${kpi.id}`}>
            <KPICard data={kpi} isLoading={isLoading} />
          </div>
        ))}

        {/* Revenue Trend — Line Chart */}
        <div
          key="line-chart"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Revenue & Sessions Trend
          </h3>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
            </div>
          ) : (
            <LineChart data={timeSeries} height={260} showGrid showTooltip animate />
          )}
        </div>

        {/* Traffic Sources — Pie Chart */}
        <div
          key="pie-chart"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Traffic Sources
          </h3>
          <PieChart data={trafficSources} height={260} innerRadius={0.6} />
        </div>

        {/* Page Views — Bar Chart */}
        <div
          key="bar-chart"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Page Views by Day
          </h3>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
            </div>
          ) : (
            <BarChart
              data={barData}
              label="Page Views"
              color="#6366f1"
              height={260}
            />
          )}
        </div>
      </ResponsiveGridLayout>
    </div>
  );
}
