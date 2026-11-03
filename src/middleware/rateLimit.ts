import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

/** Small in-memory limiter per client IP, for public (no sign-in) forms. Resets when the server restarts. */
export const rateLimit = ({ windowMs, max, message }: { windowMs: number; max: number; message: string }) => {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10000) for (const [ip, value] of hits) if (value.resetAt <= now) hits.delete(ip);
      return next();
    }
    if (++entry.count > max) return sendErrorResponse(res, message, HttpStatus.TOO_MANY_REQUESTS);
    return next();
  };
};
