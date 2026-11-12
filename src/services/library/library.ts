import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import { BookRequest, LibraryBook, LibraryLoan, LibrarySettings } from "../../model/library/library.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const DAY = 86400000;
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const codeOrId = (value: string, codeField: string) => {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return { [codeField]: text };
  if (mongoose.Types.ObjectId.isValid(text)) return { _id: text };
  return null;
};

/** The institute the library belongs to. */
export type LibraryScope = { adminId: unknown; workType: "school" | "coaching" };
type Settings = { loanDays: number; finePerDay: number; maxBooks: number };

/** Days past the due date (on `on`, default today). */
const daysLate = (dueOn: Date, on: Date = new Date(`${todayKey()}T00:00:00.000Z`)) => Math.max(0, Math.floor((on.getTime() - new Date(dueOn).getTime()) / DAY));

async function withCode<T>(create: (code: string) => Promise<T>, codeField: string): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { return await create(generateSixDigitId()); } catch (error) {
      if (!(error.code === 11000 && error.keyPattern?.[codeField]) || attempt === 9) throw error;
    }
  }
  throw new Error("Unable to generate a unique ID");
}

export class LibraryService {

  static async settings(adminId: unknown): Promise<Settings> {
    const saved = await LibrarySettings.findOne({ adminId }).lean();
    return { loanDays: saved?.loanDays ?? 14, finePerDay: saved?.finePerDay ?? 2, maxBooks: saved?.maxBooks ?? 3 };
  }

  static async updateSettings(scope: LibraryScope, input: Partial<Settings>) {
    await LibrarySettings.updateOne({ adminId: scope.adminId }, { $set: input }, { upsert: true, runValidators: true });
    return this.settings(scope.adminId);
  }

  // ---------- Books ----------

  /** Next free numeric accession number in the institute (1001, 1002…). */
  private static async nextAccession(adminId: unknown, count: number, taken: Set<string>) {
    const books = await LibraryBook.find({ adminId }).select("accessionNumbers").lean();
    const numbers = books.flatMap(book => book.accessionNumbers).concat([...taken]).filter(value => /^\d+$/.test(value)).map(Number);
    let next = Math.max(1000, ...numbers) + 1;
    return Array.from({ length: count }, () => String(next++));
  }

  /** Schools: copies are accession numbers (typed or generated, unique in the institute). Coaching: a copy count. */
  private static async copyFields(input: Record<string, any>, scope: LibraryScope, current?: Record<string, any>) {
    if (scope.workType !== "school") {
      if (input.copies === undefined) return current ? {} : (() => { throw statusError("Enter the number of copies", HttpStatus.BAD_REQUEST); })();
      return { copies: input.copies, accessionNumbers: [] };
    }
    if (input.accessionNumbers === undefined && input.copies === undefined) return {};
    let numbers: string[] = [...new Set((input.accessionNumbers ?? current?.accessionNumbers ?? []).map(String).filter(Boolean))] as string[];
    // A copy count with fewer numbers typed: generate the rest.
    const wanted = Math.max(input.copies ?? 0, numbers.length, 1);
    if (numbers.length < wanted) numbers = numbers.concat(await this.nextAccession(scope.adminId, wanted - numbers.length, new Set(numbers)));
    const clash = await LibraryBook.findOne({ adminId: scope.adminId, accessionNumbers: { $in: numbers }, ...(current ? { _id: { $ne: current._id } } : {}) }).select("title accessionNumbers").lean();
    if (clash) throw statusError(`Accession no. ${clash.accessionNumbers.find(value => numbers.includes(value))} is already used by “${clash.title}”`, HttpStatus.CONFLICT);
    return { copies: numbers.length, accessionNumbers: numbers };
  }

  static async createBook(input: Record<string, any>, scope: LibraryScope) {
    const data = {
      adminId: scope.adminId, workType: scope.workType, title: input.title, author: input.author, isbn: input.isbn || null,
      category: input.category, shelf: input.shelf || null, ...await this.copyFields(input, scope),
    };
    const book = await withCode(code => LibraryBook.create({ ...data, bookCode: code }), "bookCode");
    return (await this.presentBooks([book.toObject()]))[0];
  }

  private static async findBook(identifier: string, scope: Partial<LibraryScope>) {
    const match = codeOrId(identifier, "bookCode");
    const book = match ? await LibraryBook.findOne({ ...match, adminId: scope.adminId }).lean() : null;
    if (!book) throw statusError("Book not found", HttpStatus.NOT_FOUND);
    return book;
  }

  static async updateBook(identifier: string, input: Record<string, any>, scope: LibraryScope) {
    const book = await this.findBook(identifier, scope);
    const update: Record<string, any> = {};
    for (const field of ["title", "author", "category"]) if (input[field] !== undefined) update[field] = input[field];
    for (const field of ["isbn", "shelf"]) if (input[field] !== undefined) update[field] = input[field] || null;
    Object.assign(update, await this.copyFields(input, scope, book));
    const open = await LibraryLoan.find({ bookId: book._id, returnedOn: null }).select("accessionNo").lean();
    if (update.copies !== undefined && update.copies < open.length) throw statusError(`${open.length} copies are on loan, so copies cannot be fewer than ${open.length}`, HttpStatus.BAD_REQUEST);
    const missing = open.find(loan => loan.accessionNo && update.accessionNumbers && !update.accessionNumbers.includes(loan.accessionNo));
    if (missing) throw statusError(`Accession no. ${missing.accessionNo} is on loan and cannot be removed`, HttpStatus.BAD_REQUEST);
    const saved = await LibraryBook.findByIdAndUpdate(book._id, { $set: update }, { new: true, runValidators: true }).lean();
    return (await this.presentBooks([saved]))[0];
  }

  static async deleteBook(identifier: string, scope: LibraryScope) {
    const book = await this.findBook(identifier, scope);
    if (await LibraryLoan.exists({ bookId: book._id, returnedOn: null })) throw statusError("This book has copies on loan. Mark them returned before deleting it.", HttpStatus.CONFLICT);
    await Promise.all([LibraryBook.deleteOne({ _id: book._id }), BookRequest.updateMany({ bookId: book._id, status: "requested" }, { $set: { status: "declined" } })]);
    return { message: "Book deleted successfully" };
  }

  static async getBooks(scope: Partial<LibraryScope>) {
    return this.presentBooks(await LibraryBook.find({ adminId: scope.adminId }).sort({ title: 1 }).lean());
  }

  /** Adds how many copies are on loan / available and which accession numbers are free. */
  private static async presentBooks(books: Record<string, any>[]) {
    if (!books.length) return [];
    const loans = await LibraryLoan.find({ bookId: { $in: books.map(book => book._id) }, returnedOn: null }).select("bookId accessionNo").lean();
    return books.map(book => {
      const open = loans.filter(loan => String(loan.bookId) === String(book._id));
      const lent = new Set(open.map(loan => loan.accessionNo).filter(Boolean));
      return { ...book, onLoan: open.length, available: Math.max(0, book.copies - open.length), freeAccessionNumbers: book.accessionNumbers.filter(value => !lent.has(value)) };
    });
  }

  // ---------- Members ----------

  /** Students and teachers of the institute who can borrow. */
  static async members(scope: LibraryScope) {
    const [students, teachers] = await Promise.all([
      StudentDetailsModel.find({ adminId: scope.adminId, workType: scope.workType }).select("studentCode fullName").sort({ fullName: 1 }).lean(),
      Teacher.find({ adminId: scope.adminId }).select("teacherCode fullName").sort({ fullName: 1 }).lean(),
    ]);
    return [
      ...students.map(student => ({ type: "student", code: student.studentCode, name: student.fullName || "Unnamed student" })),
      ...teachers.map(teacher => ({ type: "teacher", code: teacher.teacherCode, name: teacher.fullName || "Unnamed teacher" })),
    ];
  }

  private static async findMember(scope: LibraryScope, type: "student" | "teacher", code: string) {
    if (type === "student") {
      const student = await StudentDetailsModel.findOne({ adminId: scope.adminId, studentCode: code }).select("_id studentCode fullName").lean();
      return student ? { _id: student._id, code: student.studentCode, name: student.fullName || "Unnamed student" } : null;
    }
    const teacher = await Teacher.findOne({ adminId: scope.adminId, teacherCode: code }).select("_id teacherCode fullName").lean();
    return teacher ? { _id: teacher._id, code: teacher.teacherCode, name: teacher.fullName || "Unnamed teacher" } : null;
  }

  // ---------- Loans ----------

  static async issue(input: Record<string, any>, scope: LibraryScope, issuedBy: unknown) {
    const settings = await this.settings(scope.adminId);
    const book = await this.findBook(input.bookCode, scope);
    const member = await this.findMember(scope, input.memberType, input.memberCode);
    if (!member) throw statusError(`${input.memberType === "student" ? "Student" : "Teacher"} not found`, HttpStatus.BAD_REQUEST);
    const open = await LibraryLoan.find({ adminId: scope.adminId, returnedOn: null, $or: [{ bookId: book._id }, { memberId: member._id }] }).lean();
    const bookLoans = open.filter(loan => String(loan.bookId) === String(book._id));
    const memberLoans = open.filter(loan => String(loan.memberId) === String(member._id));
    if (memberLoans.some(loan => String(loan.bookId) === String(book._id))) throw statusError(`${member.name} already has a copy of “${book.title}”`, HttpStatus.CONFLICT);
    if (memberLoans.length >= settings.maxBooks) throw statusError(`${member.name} already has ${memberLoans.length} books (limit ${settings.maxBooks})`, HttpStatus.CONFLICT);
    if (bookLoans.length >= book.copies) throw statusError(`No copies of “${book.title}” are available right now`, HttpStatus.CONFLICT);
    let accessionNo: string | null = null;
    if (scope.workType === "school") {
      const lent = new Set(bookLoans.map(loan => loan.accessionNo));
      const free = book.accessionNumbers.filter(value => !lent.has(value));
      accessionNo = input.accessionNo || free[0] || null;
      if (!accessionNo || !free.includes(accessionNo)) throw statusError(`Accession no. ${input.accessionNo} is not available`, HttpStatus.BAD_REQUEST);
    }
    const issuedOn = input.issuedOn ? parseDay(input.issuedOn, "issue date") : parseDay(todayKey());
    if (dayKey(issuedOn) > todayKey()) throw statusError("Issue date cannot be in the future", HttpStatus.BAD_REQUEST);
    const loan = await withCode(code => LibraryLoan.create({
      loanCode: code, adminId: scope.adminId, bookId: book._id, accessionNo, memberType: input.memberType, memberId: member._id,
      memberCode: member.code, memberName: member.name, issuedOn, dueOn: new Date(issuedOn.getTime() + settings.loanDays * DAY), issuedBy,
    }), "loanCode");
    // Issuing fills the student's open request for this book.
    const requestFilter = input.requestCode ? { requestCode: input.requestCode } : { bookId: book._id, studentId: member._id };
    if (input.memberType === "student") await BookRequest.updateMany({ adminId: scope.adminId, status: "requested", ...requestFilter }, { $set: { status: "issued" } });
    return (await this.presentLoans([loan.toObject()], settings))[0];
  }

  private static async findLoan(identifier: string, scope: LibraryScope) {
    const match = codeOrId(identifier, "loanCode");
    const loan = match ? await LibraryLoan.findOne({ ...match, adminId: scope.adminId }).lean() : null;
    if (!loan) throw statusError("Loan not found", HttpStatus.NOT_FOUND);
    return loan;
  }

  /** Charges the late fine (days late × fine per day) unless the owner waives it. */
  static async returnLoan(identifier: string, waiveFine: boolean, scope: LibraryScope) {
    const loan = await this.findLoan(identifier, scope);
    if (loan.returnedOn) throw statusError("This book has already been returned", HttpStatus.CONFLICT);
    const settings = await this.settings(scope.adminId);
    const fine = daysLate(loan.dueOn) * settings.finePerDay;
    const saved = await LibraryLoan.findByIdAndUpdate(loan._id, { $set: { returnedOn: parseDay(todayKey()), fine: waiveFine ? 0 : fine, fineWaived: waiveFine && fine > 0 } }, { new: true }).lean();
    return (await this.presentLoans([saved], settings))[0];
  }

  static async renew(identifier: string, scope: LibraryScope) {
    const loan = await this.findLoan(identifier, scope);
    if (loan.returnedOn) throw statusError("This book has already been returned", HttpStatus.CONFLICT);
    if (daysLate(loan.dueOn) > 0) throw statusError("Overdue books cannot be renewed. Return the book and pay the fine first.", HttpStatus.BAD_REQUEST);
    const settings = await this.settings(scope.adminId);
    const saved = await LibraryLoan.findByIdAndUpdate(loan._id, { $set: { dueOn: new Date(new Date(loan.dueOn).getTime() + settings.loanDays * DAY) }, $inc: { renewals: 1 } }, { new: true }).lean();
    return (await this.presentLoans([saved], settings))[0];
  }

  static async getLoans(scope: Partial<LibraryScope>, filter: Record<string, any> = {}) {
    const settings = await this.settings(scope.adminId);
    return this.presentLoans(await LibraryLoan.find({ adminId: scope.adminId, ...filter }).sort({ returnedOn: 1, issuedOn: -1 }).lean(), settings);
  }

  /** Status and the fine so far (open loans) or charged (returned). */
  private static async presentLoans(loans: Record<string, any>[], settings: Settings) {
    if (!loans.length) return [];
    const books = await LibraryBook.find({ _id: { $in: loans.map(loan => loan.bookId) } }).select("bookCode title").lean();
    const byId = new Map(books.map(book => [String(book._id), book]));
    return loans.map(loan => {
      const late = loan.returnedOn ? 0 : daysLate(loan.dueOn);
      const book = byId.get(String(loan.bookId));
      return {
        ...loan, bookCode: book?.bookCode ?? null, title: book?.title ?? "Deleted book",
        status: loan.returnedOn ? "returned" : late > 0 ? "overdue" : "issued", daysLate: late,
        currentFine: loan.returnedOn ? loan.fine : late * settings.finePerDay,
      };
    });
  }

  // ---------- Requests ----------

  static async getRequests(scope: Partial<LibraryScope>, filter: Record<string, any> = {}) {
    const requests = await BookRequest.find({ adminId: scope.adminId, ...filter }).sort({ status: 1, createdAt: -1 }).lean();
    const books = await LibraryBook.find({ _id: { $in: requests.map(request => request.bookId) } }).select("bookCode title").lean();
    const byId = new Map(books.map(book => [String(book._id), book]));
    return requests.map(request => ({ ...request, bookCode: byId.get(String(request.bookId))?.bookCode ?? null, title: byId.get(String(request.bookId))?.title ?? "Deleted book" }));
  }

  static async declineRequest(identifier: string, scope: LibraryScope) {
    const match = codeOrId(identifier, "requestCode");
    const request = match ? await BookRequest.findOneAndUpdate({ ...match, adminId: scope.adminId, status: "requested" }, { $set: { status: "declined" } }, { new: true }).lean() : null;
    if (!request) throw statusError("Request not found or already handled", HttpStatus.NOT_FOUND);
    return request;
  }

  // ---------- Student portal ----------

  /** The signed-in student's record and institute. */
  static async studentContext(authUserId: unknown) {
    const student = await StudentDetailsModel.findOne({ studentId: authUserId }).select("_id studentCode fullName adminId workType").lean();
    if (!student?.adminId) throw statusError("Your student profile is not linked to an institute", HttpStatus.FORBIDDEN);
    return student;
  }

  /** Catalogue, the student's own loans and requests, and the library rules. */
  static async myLibrary(authUserId: unknown) {
    const student = await this.studentContext(authUserId);
    const scope = { adminId: student.adminId };
    const [settings, books, loans, requests] = await Promise.all([
      this.settings(student.adminId), this.getBooks(scope),
      this.getLoans(scope, { memberType: "student", memberId: student._id }), this.getRequests(scope, { studentId: student._id }),
    ]);
    // Students see titles and availability, not accession numbers.
    return { settings, studentCode: student.studentCode, books: books.map(({ accessionNumbers, freeAccessionNumbers, ...book }) => book), loans, requests };
  }

  static async requestBook(authUserId: unknown, bookCode: string) {
    const student = await this.studentContext(authUserId);
    const book = await this.findBook(bookCode, { adminId: student.adminId });
    if (await LibraryLoan.exists({ bookId: book._id, memberId: student._id, returnedOn: null })) throw statusError("You already have this book", HttpStatus.CONFLICT);
    if (await BookRequest.exists({ bookId: book._id, studentId: student._id, status: "requested" })) throw statusError("You have already requested this book", HttpStatus.CONFLICT);
    const request = await withCode(code => BookRequest.create({
      requestCode: code, adminId: student.adminId, bookId: book._id, studentId: student._id, studentCode: student.studentCode, studentName: student.fullName || "Student",
    }), "requestCode");
    return { ...request.toObject(), bookCode: book.bookCode, title: book.title };
  }
}
