import { useMemo } from "react";
import { clsx } from "clsx";
import { motion } from "framer-motion";

import type { KPIData } from "../types";

interface KPICardProps {
  data: KPIData;
  isLoading?: boolean;
  className?: string;
}

function formatValue(value: number, format: KPIData["format"]): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "percentage":
      return `${value.toFixed(1)}%`;
    case "duration":
      if (value >= 3600) {
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        return `${hours}h ${minutes}m`;
      }
      const minutes = Math.floor(value / 60);
      const seconds = Math.floor(value % 60);
      return `${minutes}m ${seconds}s`;
    case "number":
    default:
      return new Intl.NumberFormat("en-US", {
        notation: value >= 100_000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(value);
  }
}

function SparkLine({ data, color }: { data: { value: number }[]; color: string }) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 28;
  const padding = 2;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function KPICard({ data, isLoading, className }: KPICardProps) {
  const { changePercent, isPositive } = useMemo(() => {
    if (data.previousValue === 0) {
      return { changePercent: 0, isPositive: true };
    }
    const pct =
      ((data.value - data.previousValue) / Math.abs(data.previousValue)) * 100;
    return { changePercent: pct, isPositive: pct >= 0 };
  }, [data.value, data.previousValue]);

  const trendColor = isPositive ? "#10b981" : "#ef4444";

  if (isLoading) {
    return (
      <div
        className={clsx(
          "flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
          className,
        )}
      >
        <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
        <div className="h-7 w-28 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        "flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      {/* Label */}
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {data.label}
      </span>

      {/* Value + Spark */}
      <div className="mt-1 flex items-end justify-between">
        <span className="text-2xl font-bold text-slate-900">
          {formatValue(data.value, data.format)}
        </span>
        <SparkLine data={data.trend} color={trendColor} />
      </div>

      {/* Change indicator */}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={clsx(
            "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
            isPositive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          <svg
            className={clsx("h-3 w-3", !isPositive && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 15l7-7 7 7"
            />
          </svg>
          {Math.abs(changePercent).toFixed(1)}%
        </span>
        <span className="text-xs text-slate-400">vs prev. period</span>
      </div>
    </motion.div>
  );
}
