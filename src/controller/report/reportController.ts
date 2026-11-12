import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { ReportService, ReportType } from "../../services/report/report.js";
import { DashboardService } from "../../services/report/dashboard.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { staffActor } from "../../utilis/staffAccess.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

const ownerScope = async (req) => {
  const { adminId, workType } = await resolveOwnerScope(req);
  if (!adminId || !workType) throw Object.assign(new Error("Sign in as the institute's owner"), { statusCode: HttpStatus.FORBIDDEN });
  return { adminId, workType };
};

// GET /report/:type?from=YYYY-MM-DD&to=YYYY-MM-DD (owner)
export const getReport = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Report generated", await ReportService.build(req.params.type as ReportType, await ownerScope(req), req.query.from, req.query.to));
  } catch (error) { return handleError(res, error, "Report error"); }
};

// GET /report/dashboard/summary — owner or teacher home page.
export const getDashboard = async (req, res) => {
  try {
    if (req.role === "teacher") return sendSuccessResponse(res, "Dashboard retrieved", { role: "teacher", ...await DashboardService.teacher(await staffActor(req), req.userData.fullName ?? null) });
    return sendSuccessResponse(res, "Dashboard retrieved", { role: "owner", ...await DashboardService.owner(await ownerScope(req)) });
  } catch (error) { return handleError(res, error, "Dashboard error"); }
};
