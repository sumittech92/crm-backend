import express from "express";
import * as library from "../../controller/library/libraryController.js";
import { verifyAuthToken, requireOwner, requireStaff } from "../../middleware/authMiddleware.js";
import { validateBook, validateBookRequest, validateBookUpdate, validateIssue, validateLibrarySettings, validateReturn } from "../../validation/library.js";

const router = express.Router();

const requireStudent = (req, res, next) => req.role === "student" ? next() : res.status(403).json({ auth: false, message: "Student access required" });

// Student portal: catalogue, own loans and requests.
router.get("/my", verifyAuthToken, requireStudent, library.getMyLibrary);
router.post("/my/requests", verifyAuthToken, requireStudent, validateBookRequest, library.requestBook);

// Staff read; only the owner changes the library.
router.get("/settings", verifyAuthToken, requireStaff, library.getSettings);
router.patch("/settings", verifyAuthToken, requireOwner, validateLibrarySettings, library.updateSettings);
router.get("/books", verifyAuthToken, requireStaff, library.getBooks);
router.post("/books", verifyAuthToken, requireOwner, validateBook, library.createBook);
router.patch("/books/:bookId", verifyAuthToken, requireOwner, validateBookUpdate, library.updateBook);
router.delete("/books/:bookId", verifyAuthToken, requireOwner, library.deleteBook);
router.get("/members", verifyAuthToken, requireOwner, library.getMembers);
router.get("/loans", verifyAuthToken, requireStaff, library.getLoans);
router.post("/loans", verifyAuthToken, requireOwner, validateIssue, library.issueBook);
router.post("/loans/:loanId/return", verifyAuthToken, requireOwner, validateReturn, library.returnBook);
router.post("/loans/:loanId/renew", verifyAuthToken, requireOwner, library.renewLoan);
router.get("/requests", verifyAuthToken, requireStaff, library.getRequests);
router.post("/requests/:requestId/decline", verifyAuthToken, requireOwner, library.declineRequest);

export default router;
