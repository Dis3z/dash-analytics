import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// ─── Types ───────────────────────────────────────────────────

interface JwtPayload {
  sub: string;
  email: string;
  role: "viewer" | "editor" | "admin";
  iat: number;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
  userRole: JwtPayload["role"];
}

// ─── Config ──────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev-secret-change-me") {
  logger.fatal("JWT_SECRET must be set in production. Exiting.");
  process.exit(1);
}

// ─── Token Verification Middleware ───────────────────────────

/**
 * Extracts and verifies a JWT from the Authorization header.
 * On success, attaches `userId`, `userEmail`, and `userRole` to the request.
 */
export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: {
        message: "Authorization header is required",
        code: "AUTH_MISSING",
        status: 401,
      },
    });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({
      error: {
        message: "Authorization header must use Bearer scheme",
        code: "AUTH_INVALID_SCHEME",
        status: 401,
      },
    });
    return;
  }

  const token = parts[1]!;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;

    (req as AuthenticatedRequest).userId = decoded.sub;
    (req as AuthenticatedRequest).userEmail = decoded.email;
    (req as AuthenticatedRequest).userRole = decoded.role;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: {
          message: "Token has expired",
          code: "AUTH_TOKEN_EXPIRED",
          status: 401,
        },
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: {
          message: "Invalid token",
          code: "AUTH_TOKEN_INVALID",
          status: 401,
        },
      });
      return;
    }

    logger.error({ err }, "Unexpected authentication error");
    res.status(500).json({
      error: {
        message: "Authentication failed",
        code: "AUTH_ERROR",
        status: 500,
      },
    });
  }
}

// ─── Role Authorization Middleware ───────────────────────────

/**
 * Restricts access to users whose role is included in the allowed list.
 * Must be used AFTER `verifyToken`.
 *
 * @example
 *   router.delete("/reports/:id", verifyToken, requireRole("admin"), handler);
 */
export function requireRole(...allowedRoles: JwtPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as AuthenticatedRequest).userRole;

    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({
        error: {
          message: "Insufficient permissions",
          code: "FORBIDDEN",
          status: 403,
        },
      });
      return;
    }

    next();
  };
}

// ─── Token Generation (used in auth routes) ──────────────────

export function generateToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  });
}
