import HttpStatus from "http-status-codes";
import MockPaper, { MAX_PAPER_DOWNLOADS, PAPER_BOARDS, PAPER_CLASSES } from "../../model/mockPaper/mockPaper.js";
import Course from "../../model/teacher/courseModel.js";
import Syllabus from "../../model/syllabus/syllabus.js";
import { insertWithCode, statusError } from "../../utilis/records.js";
import { PAPER_SIZES, PaperRequest, writePaper } from "./paperWriter.js";

/** Papers one person may generate per day (each one is an API call). */
const DAILY_LIMIT = { student: Number(process.env.MOCK_PAPER_DAILY_LIMIT_STUDENT) || 5, staff: Number(process.env.MOCK_PAPER_DAILY_LIMIT_STAFF) || 20 };

export type PaperActor = { authId: unknown; role: "student" | "teacher" | "admin"; name: string; adminId: unknown; studentId?: unknown; className?: string | null };

const startOfToday = () => { const day = new Date(); day.setHours(0, 0, 0, 0); return day; };

export class MockPaperService {

  /** Boards, classes 9–12 and, for each class, its subjects with chapters from the school's Syllabus. */
  static async options(adminId: unknown, onlyClass?: string | null) {
    const classes = onlyClass ? [onlyClass] : [...PAPER_CLASSES];
    const courses = await Course.find({ adminId, name: { $in: classes } }).select("name subjects").lean();
    const syllabi = await Syllabus.find({ adminId, courseId: { $in: courses.map(course => course._id) } }).select("courseId subject chapters.title").lean();
    return {
      boards: PAPER_BOARDS, sizes: PAPER_SIZES, maxDownloads: MAX_PAPER_DOWNLOADS,
      classes: classes.map(name => {
        const course = courses.find(item => item.name === name);
        const subjects = new Map<string, string[]>();
        (course?.subjects || []).forEach(subject => subjects.set(subject, []));
        syllabi.filter(item => course && String(item.courseId) === String(course._id))
          .forEach(item => subjects.set(item.subject, item.chapters.map(chapter => chapter.title)));
        return { className: name, subjects: [...subjects.entries()].map(([subject, chapters]) => ({ subject, chapters })).sort((a, b) => a.subject.localeCompare(b.subject)) };
      }),
    };
  }

  private static present(paper: Record<string, any>, role: PaperActor["role"]) {
    const limited = paper.createdByRole === "student" && role === "student";
    return { ...paper, maxDownloads: limited ? MAX_PAPER_DOWNLOADS : null, downloadsLeft: limited ? Math.max(0, MAX_PAPER_DOWNLOADS - paper.downloads) : null };
  }

  /** Students: their own papers. Staff: every paper of the school (or only their own with mine=true). */
  static async list(actor: PaperActor, { mine, className, subject }: { mine?: string; className?: string; subject?: string } = {}) {
    const filter: Record<string, any> = { adminId: actor.adminId };
    if (actor.role === "student" || mine === "true") filter.createdBy = actor.authId;
    if (className) filter.className = className;
    if (subject) filter.subject = subject;
    // The list doesn't need the questions; they come with a download.
    const papers = await MockPaper.find(filter).select("-sections").sort({ createdAt: -1 }).limit(300).lean();
    return papers.map(paper => this.present(paper, actor.role));
  }

  static async generate(actor: PaperActor, input: Record<string, any>) {
    const className = actor.role === "student" ? actor.className : input.className;
    if (!className || !(PAPER_CLASSES as readonly string[]).includes(className)) {
      throw statusError(actor.role === "student" ? "Mock papers are available for Classes 9 to 12." : "Choose a class from 9 to 12.", HttpStatus.BAD_REQUEST);
    }
    const limit = actor.role === "student" ? DAILY_LIMIT.student : DAILY_LIMIT.staff;
    const today = await MockPaper.countDocuments({ createdBy: actor.authId, createdAt: { $gte: startOfToday() } });
    if (today >= limit) throw statusError(`You can generate ${limit} papers a day. Download the papers you already have, or try again tomorrow.`, HttpStatus.TOO_MANY_REQUESTS);

    const request: PaperRequest = {
      board: input.board, className, subject: input.subject, kind: input.kind,
      chapters: input.kind === "chapter" ? [...new Set<string>(input.chapters)] : [], length: input.length, difficulty: input.difficulty,
    };
    const written = await writePaper(request);
    let number = 0;
    const sections = written.sections.map(section => ({
      name: section.name, description: section.description,
      questions: section.questions.map(question => ({ ...question, number: ++number, options: question.type === "mcq" || question.type === "assertionReason" ? question.options : [] })),
    })).filter(section => section.questions.length);
    if (!number) throw statusError("The paper came out empty. Please try again.", HttpStatus.BAD_GATEWAY);
    const totalMarks = sections.reduce((sum, section) => sum + section.questions.reduce((total, question) => total + question.marks, 0), 0);
    const created = await insertWithCode(MockPaper, "paperCode", {
      adminId: actor.adminId, createdBy: actor.authId, createdByRole: actor.role, createdByName: actor.name, studentId: actor.studentId ?? null,
      ...request, title: written.title, instructions: written.instructions, sections, totalMarks, durationMinutes: PAPER_SIZES[request.length].minutes,
    });
    const { sections: _questions, ...summary } = created.toObject();
    return this.present(summary, actor.role);
  }

  /**
   * Returns the full paper to print / save as PDF and counts the download. A student can download a paper they generated
   * at most MAX_PAPER_DOWNLOADS times; the response says how many are left so the app can warn them.
   */
  static async download(actor: PaperActor, paperCode: string) {
    const filter: Record<string, any> = { paperCode: String(paperCode), adminId: actor.adminId };
    if (actor.role === "student") filter.createdBy = actor.authId;
    const paper = await MockPaper.findOne(filter).lean();
    if (!paper) throw statusError("Paper not found", HttpStatus.NOT_FOUND);
    const limited = actor.role === "student";
    if (limited) {
      // Count atomically so two quick clicks can't go over the limit.
      const counted = await MockPaper.findOneAndUpdate({ _id: paper._id, downloads: { $lt: MAX_PAPER_DOWNLOADS } }, { $inc: { downloads: 1 }, $set: { lastDownloadedAt: new Date() } }, { new: true }).lean();
      if (!counted) throw statusError(`You have already downloaded this paper ${MAX_PAPER_DOWNLOADS} times. Generate a new paper to keep practising.`, HttpStatus.FORBIDDEN);
      return this.present(counted, actor.role);
    }
    return this.present(paper, actor.role);
  }
}
