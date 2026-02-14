<p align="center">
  <img src="docs/assets/logo.svg" alt="DashAnalytics" width="80" />
</p>

<h1 align="center">DashAnalytics</h1>

<p align="center">
  <strong>Enterprise-grade data visualization dashboard for real-time business intelligence.</strong>
</p>

<p align="center">
  <a href="https://github.com/nicolaslumbert/dash-analytics/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/nicolaslumbert/dash-analytics/ci.yml?branch=main&style=flat-square&logo=github" alt="CI" />
  </a>
  <a href="https://codecov.io/gh/nicolaslumbert/dash-analytics">
    <img src="https://img.shields.io/codecov/c/github/nicolaslumbert/dash-analytics?style=flat-square&logo=codecov" alt="Coverage" />
  </a>
  <a href="https://github.com/nicolaslumbert/dash-analytics/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18.2-61dafb?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-20_LTS-339933?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/MongoDB-7.0-47A248?style=flat-square&logo=mongodb" alt="MongoDB" />
  <img src="https://img.shields.io/badge/D3.js-7.8-F9A03C?style=flat-square&logo=d3.js" alt="D3.js" />
</p>

---

## Overview

DashAnalytics is a full-stack analytics platform that transforms raw business data into actionable insights through interactive, real-time visualizations. Built as a monorepo with a React + D3.js frontend and a Node.js + MongoDB backend, it supports multi-source data ingestion, automated report scheduling, and PDF export out of the box.

## Features

- **Real-Time Charts** — Live-updating line, bar, pie, and area charts powered by D3.js with smooth transition animations and configurable refresh intervals.
- **Multi-Source Data Ingestion** — Connect to REST APIs, PostgreSQL, MySQL, CSV uploads, and webhook endpoints. A unified adapter layer normalizes data before aggregation.
- **Automated Report Scheduling** — Define recurring reports (daily, weekly, monthly) via cron expressions. Reports are generated server-side and delivered by email or stored in S3.
- **PDF & CSV Export** — One-click export of any dashboard view to pixel-perfect PDF (via Puppeteer) or structured CSV. Batch export is supported for scheduled reports.
- **Role-Based Access Control** — JWT-based authentication with granular permissions (viewer, editor, admin). Supports SSO via SAML 2.0 and OAuth 2.0 providers.
- **Responsive Dashboard Grid** — Drag-and-drop layout builder using `react-grid-layout`. Dashboards adapt seamlessly from 4K monitors to tablets.
- **KPI Cards with Trend Indicators** — At-a-glance metric cards showing current value, period-over-period change, and sparkline trend.
- **Redis-Backed Caching** — Aggregation results are cached in Redis with configurable TTL, reducing MongoDB query load by up to 90% for repeat views.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, D3.js 7, Recharts, TailwindCSS, React Router, Zustand |
| Backend | Node.js 20, Express, TypeScript, Mongoose, Bull (job queue) |
| Database | MongoDB 7, Redis 7 |
| Infrastructure | Docker, Docker Compose, GitHub Actions CI/CD |
| Testing | Vitest, React Testing Library, Supertest |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Client (React)                │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ Dashboard  │ │  Charts  │ │  Report Builder│ │
│  │   Grid    │ │  (D3.js) │ │                │ │
│  └─────┬─────┘ └────┬─────┘ └───────┬────────┘ │
│        └─────────────┼───────────────┘          │
│                      │ REST / WebSocket         │
└──────────────────────┼──────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────┐
│                  Server (Express)                │
│  ┌──────────┐ ┌──────┴─────┐ ┌───────────────┐ │
│  │   Auth   │ │  Analytics │ │  Report Svc   │ │
│  │Middleware │ │   Routes   │ │  (Bull Queue) │ │
│  └──────────┘ └──────┬─────┘ └───────────────┘ │
│                      │                          │
│         ┌────────────┼────────────┐             │
│    ┌────┴────┐  ┌────┴────┐  ┌───┴───┐         │
│    │MongoDB  │  │  Redis  │  │  S3   │         │
│    └─────────┘  └─────────┘  └───────┘         │
└─────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose (for local infrastructure)

### Installation

```bash
# Clone the repository
git clone https://github.com/nicolaslumbert/dash-analytics.git
cd dash-analytics

# Install dependencies (monorepo workspaces)
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (MongoDB + Redis)
docker compose up -d mongo redis

# Run database seeds
pnpm --filter server db:seed

# Start development servers (client + server concurrently)
pnpm dev
```

The client runs at `http://localhost:5173` and the API at `http://localhost:4000`.

### Using Docker (Full Stack)

```bash
docker compose up --build
```

This starts all services: client (nginx), API server, MongoDB, and Redis.

## API Documentation

### Authentication

All protected endpoints require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
```

#### `POST /api/auth/login`
Authenticate a user and receive a JWT.

```json
{
  "email": "analyst@company.com",
  "password": "securepassword"
}
```

**Response** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "64a...", "email": "analyst@company.com", "role": "editor" }
}
```

### Analytics

#### `GET /api/analytics/metrics`
Retrieve aggregated metrics with optional filters.

| Parameter | Type | Description |
|---|---|---|
| `startDate` | `string` | ISO 8601 start date |
| `endDate` | `string` | ISO 8601 end date |
| `source` | `string` | Data source identifier |
| `granularity` | `string` | `hour`, `day`, `week`, `month` |
| `metrics` | `string` | Comma-separated metric names |

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/analytics/metrics?startDate=2025-01-01&endDate=2025-01-31&granularity=day&metrics=revenue,sessions"
```

**Response** `200 OK`
```json
{
  "data": [
    { "date": "2025-01-01", "revenue": 14520.50, "sessions": 3842 },
    { "date": "2025-01-02", "revenue": 16105.00, "sessions": 4210 }
  ],
  "meta": { "total": 31, "granularity": "day" }
}
```

#### `GET /api/analytics/kpi`
Retrieve KPI summary with period comparison.

#### `POST /api/analytics/reports`
Generate and schedule a report.

#### `GET /api/analytics/reports/:id/export`
Export a report as PDF or CSV. Accepts `format` query param (`pdf` | `csv`).

### WebSocket (Real-Time Updates)

Connect to `ws://localhost:4000` with a valid JWT to receive live metric updates:

```javascript
const ws = new WebSocket('ws://localhost:4000?token=<jwt>');
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  // { type: 'metric_update', payload: { metric: 'active_users', value: 1423 } }
};
```

## Project Structure

```
dash-analytics/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── charts/        # D3.js chart components
│   │   │   ├── KPICard.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Route pages
│   │   ├── types/             # TypeScript interfaces
│   │   └── App.tsx
│   └── package.json
├── server/                    # Express API
│   ├── src/
│   │   ├── middleware/        # Auth, validation, error handling
│   │   ├── models/            # Mongoose schemas
│   │   ├── routes/            # API route handlers
│   │   └── services/          # Business logic & aggregation
│   └── package.json
├── docker-compose.yml
├── tsconfig.json
└── package.json               # Monorepo root (pnpm workspaces)
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start client and server in development mode |
| `pnpm build` | Build both client and server for production |
| `pnpm test` | Run test suites across all workspaces |
| `pnpm lint` | Lint and format all TypeScript files |
| `pnpm --filter client dev` | Start only the client dev server |
| `pnpm --filter server dev` | Start only the API server |
| `pnpm --filter server db:seed` | Seed the database with sample data |

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/dashanalytics` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `JWT_SECRET` | — | Secret key for JWT signing |
| `PORT` | `4000` | API server port |
| `CLIENT_URL` | `http://localhost:5173` | Frontend URL (for CORS) |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push to the branch and open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://github.com/nicolaslumbert">Nicolas Lumbert</a>
</p>
