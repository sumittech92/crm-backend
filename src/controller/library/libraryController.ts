import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { LibraryScope, LibraryService } from "../../services/library/library.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

/** The owner's (or the teacher's) institute. Super admins work through an owner's account. */
const scopeFor = async (req): Promise<LibraryScope> => {
  const { adminId, workType } = await resolveOwnerScope(req);
  if (!adminId || !workType) throw Object.assign(new Error("The library belongs to an institute; sign in as its owner or teacher"), { statusCode: HttpStatus.FORBIDDEN });
  return { adminId, workType };
};

const handler = (label: string, run: (req) => Promise<unknown>, message: string, status = HttpStatus.OK) => async (req, res) => {
  try { return sendSuccessResponse(res, message, await run(req), status); } catch (error) { return handleError(res, error, label); }
};

export const getSettings = handler("Library settings error", async req => LibraryService.settings((await scopeFor(req)).adminId), "Library settings retrieved");
export const updateSettings = handler("Library settings error", async req => LibraryService.updateSettings(await scopeFor(req), req.body), "Library settings saved");
export const getBooks = handler("Book list error", async req => LibraryService.getBooks(await scopeFor(req)), "Books retrieved");
export const createBook = handler("Book creation error", async req => LibraryService.createBook(req.body, await scopeFor(req)), "Book added", HttpStatus.CREATED);
export const updateBook = handler("Book update error", async req => LibraryService.updateBook(req.params.bookId, req.body, await scopeFor(req)), "Book updated");
export const deleteBook = handler("Book deletion error", async req => LibraryService.deleteBook(req.params.bookId, await scopeFor(req)), "Book deleted");
export const getMembers = handler("Member list error", async req => LibraryService.members(await scopeFor(req)), "Members retrieved");
export const getLoans = handler("Loan list error", async req => LibraryService.getLoans(await scopeFor(req)), "Loans retrieved");
export const issueBook = handler("Issue error", async req => LibraryService.issue(req.body, await scopeFor(req), req.userData._id), "Book issued", HttpStatus.CREATED);
export const returnBook = handler("Return error", async req => LibraryService.returnLoan(req.params.loanId, !!req.body.waiveFine, await scopeFor(req)), "Book returned");
export const renewLoan = handler("Renew error", async req => LibraryService.renew(req.params.loanId, await scopeFor(req)), "Loan renewed");
export const getRequests = handler("Request list error", async req => LibraryService.getRequests(await scopeFor(req)), "Requests retrieved");
export const declineRequest = handler("Decline error", async req => LibraryService.declineRequest(req.params.requestId, await scopeFor(req)), "Request declined");
export const getMyLibrary = handler("Student library error", async req => LibraryService.myLibrary(req.userData._id), "Library retrieved");
export const requestBook = handler("Book request error", async req => LibraryService.requestBook(req.userData._id, req.body.bookCode), "Book requested", HttpStatus.CREATED);
