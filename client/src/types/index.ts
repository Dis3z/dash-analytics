// ─── Metric Types ────────────────────────────────────────────

export type Granularity = "hour" | "day" | "week" | "month";

export type MetricName =
  | "revenue"
  | "sessions"
  | "conversions"
  | "bounce_rate"
  | "avg_session_duration"
  | "active_users"
  | "page_views"
  | "new_users";

export interface DataPoint {
  date: string;
  value: number;
}

export interface TimeSeriesData {
  metric: MetricName;
  label: string;
  color: string;
  data: DataPoint[];
}

export interface MetricFilter {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  metrics: MetricName[];
  source?: string;
}

export interface MetricResponse {
  data: Record<string, number | string>[];
  meta: {
    total: number;
    granularity: Granularity;
    startDate: string;
    endDate: string;
  };
}

// ─── KPI Types ───────────────────────────────────────────────

export interface KPIData {
  id: string;
  label: string;
  value: number;
  previousValue: number;
  format: "number" | "currency" | "percentage" | "duration";
  trend: DataPoint[];
}

export interface KPIResponse {
  kpis: KPIData[];
  period: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
}

// ─── Chart Types ─────────────────────────────────────────────

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  margin: ChartMargin;
  innerWidth: number;
  innerHeight: number;
}

export interface LineChartProps {
  data: TimeSeriesData[];
  width?: number;
  height?: number;
  margin?: Partial<ChartMargin>;
  showGrid?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
}

export interface BarChartProps {
  data: DataPoint[];
  label: string;
  color?: string;
  width?: number;
  height?: number;
  margin?: Partial<ChartMargin>;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

export interface PieChartProps {
  data: PieSlice[];
  width?: number;
  height?: number;
  innerRadius?: number;
  padAngle?: number;
  className?: string;
}

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

// ─── Report Types ────────────────────────────────────────────

export type ReportStatus = "pending" | "processing" | "completed" | "failed";
export type ReportFormat = "pdf" | "csv";
export type ReportSchedule = "once" | "daily" | "weekly" | "monthly";

export interface Report {
  id: string;
  title: string;
  description: string;
  metrics: MetricName[];
  filters: MetricFilter;
  format: ReportFormat;
  schedule: ReportSchedule;
  status: ReportStatus;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── User & Auth ─────────────────────────────────────────────

export type UserRole = "viewer" | "editor" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

// ─── Navigation ──────────────────────────────────────────────

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}

// ─── API ─────────────────────────────────────────────────────

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
