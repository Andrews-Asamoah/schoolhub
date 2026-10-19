import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type School } from "@prisma/client";
import {
  createStudentSchema,
  type AdmitApplicationInput,
  type DecideApplicationInput,
  type ExemptAdmissionFeeInput,
  type ReceiveAdmissionFeeInput,
  type RecordExamScoreInput,
  type SaveAdmissionCycleInput,
  type ScheduleExamInput,
  type SubmitApplicationInput,
  type TrackApplicationInput,
} from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { CredentialsService } from "../accounts/credentials.service.js";
import { FinanceService } from "../finance/finance.service.js";
import { StudentsService } from "../students/students.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const endOfDay = (iso: string) => new Date(`${iso}T23:59:59.999Z`);
const digits = (value: string) => value.replace(/\D/g, "");

/**
 * Tiny in-memory sliding-window limiter for the anonymous endpoints. Good for
 * a single API instance; use a shared store (Redis) once the API is scaled out.
 */
class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  check(key: string) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      throw new HttpException(
        "Too many requests. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
  }
}

@Injectable()
export class AdmissionsService {
  private readonly submitLimiter = new RateLimiter(8, 60 * 60 * 1000);
  private readonly trackLimiter = new RateLimiter(30, 60 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly credentials: CredentialsService,
    private readonly finance: FinanceService,
  ) {}

  // ------------------------------------------------------------------ public

  private async schoolBySubdomain(subdomain: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { subdomain: subdomain.trim().toLowerCase() },
    });
    if (!school) throw new NotFoundException("School not found.");
    return school;
  }

  /** What the public /apply page shows: the school and its open intakes. */
  async getPublicIntake(subdomain: string) {
    const school = await this.schoolBySubdomain(subdomain);
    const now = new Date();
    const cycles = await this.prisma.client.admissionCycle.findMany({
      where: {
        schoolId: school.id,
        status: "OPEN",
        opensAt: { lte: now },
        closesAt: { gte: now },
      },
      orderBy: { closesAt: "asc" },
      include: {
        academicYear: { select: { name: true } },
        classes: {
          include: { class: { select: { id: true, name: true, level: true, isActive: true } } },
        },
      },
    });
    return {
      school: {
        name: school.name,
        logo: school.logo,
        motto: school.motto,
        currency: school.currency,
        email: school.email,
        phone: school.phone,
        primaryColor: school.primaryColor,
      },
      cycles: cycles.map((c) => ({
        id: c.id,
        name: c.name,
        academicYear: c.academicYear.name,
        opensAt: c.opensAt,
        closesAt: c.closesAt,
        instructions: c.instructions,
        admissionFee: Number(c.admissionFee),
        classes: c.classes
          .filter((row) => row.class.isActive)
          .map((row) => ({ classId: row.class.id, name: row.class.name, level: row.class.level })),
      })),
    };
  }

  async submitApplication(subdomain: string, input: SubmitApplicationInput, ip: string) {
    const school = await this.schoolBySubdomain(subdomain);
    this.submitLimiter.check(`${school.id}:${ip}`);

    // Honeypot: bots fill the hidden field. Pretend it worked, store nothing.
    if (input.website && input.website.trim() !== "") {
      return { applicationNumber: "PENDING", status: "SUBMITTED", className: "", cycleName: "", admissionFee: 0, currency: school.currency };
    }

    const dob = startOfDay(input.dateOfBirth);
    const today = new Date();
    const ageYears = (today.getTime() - dob.getTime()) / (365.25 * DAY_MS);
    if (Number.isNaN(dob.getTime()) || dob > today || ageYears < 2 || ageYears > 25) {
      throw new BadRequestException("Check the date of birth entered.");
    }

    const guardianEmail = input.guardianEmail?.trim().toLowerCase() || null;

    return this.prisma.client.$transaction(async (tx) => {
      const offered = await tx.admissionCycleClass.findFirst({
        where: {
          classId: input.classId,
          class: { schoolId: school.id, isActive: true, deletedAt: null },
          cycle: {
            schoolId: school.id,
            status: "OPEN",
            opensAt: { lte: new Date() },
            closesAt: { gte: new Date() },
          },
        },
        include: {
          cycle: { select: { id: true, name: true, admissionFee: true } },
          class: { select: { name: true } },
        },
      });
      if (!offered) {
        throw new BadRequestException(
          "Applications for that class are not open. Choose a class from the list.",
        );
      }

      const duplicate = await tx.application.findFirst({
        where: {
          cycleId: offered.cycleId,
          firstName: { equals: input.firstName, mode: "insensitive" },
          lastName: { equals: input.lastName, mode: "insensitive" },
          dateOfBirth: dob,
          status: { notIn: ["WITHDRAWN", "REJECTED"] },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          "An application for this applicant already exists in this intake. Use “Track application” to check its progress.",
        );
      }

      const yy = String(new Date().getUTCFullYear()).slice(-2);
      const prefix = `${school.code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "SCH"}-A${yy}-`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${school.id}), hashtext(${prefix}))`;
      const last = await tx.application.findFirst({
        where: { schoolId: school.id, applicationNumber: { startsWith: prefix } },
        orderBy: { applicationNumber: "desc" },
        select: { applicationNumber: true },
      });
      const seq = last ? Number(last.applicationNumber.slice(prefix.length)) + 1 : 1;
      const applicationNumber = `${prefix}${String(seq).padStart(5, "0")}`;

      await tx.application.create({
        data: {
          schoolId: school.id,
          cycleId: offered.cycleId,
          cycleClassId: offered.id,
          classId: input.classId,
          applicationNumber,
          firstName: input.firstName,
          lastName: input.lastName,
          otherNames: input.otherNames || null,
          gender: input.gender,
          dateOfBirth: dob,
          nationality: input.nationality,
          previousSchool: input.previousSchool || null,
          previousClass: input.previousClass || null,
          residentialAddress: input.residentialAddress || null,
          city: input.city || null,
          region: input.region || null,
          guardianFirstName: input.guardianFirstName,
          guardianLastName: input.guardianLastName,
          guardianPhone: input.guardianPhone,
          guardianEmail,
          guardianRelationship: input.guardianRelationship,
          // The fee is fixed when the application is made (cash, on exam day).
          feeDue: offered.cycle.admissionFee,
          feeStatus: offered.cycle.admissionFee.gt(0) ? "PENDING" : "NOT_REQUIRED",
        },
      });
      return {
        applicationNumber,
        status: "SUBMITTED" as const,
        className: offered.class.name,
        cycleName: offered.cycle.name,
        admissionFee: Number(offered.cycle.admissionFee),
        currency: school.currency,
      };
    });
  }

  /** Reference number + the phone/email used to apply. Never reveals scores. */
  async trackApplication(subdomain: string, input: TrackApplicationInput, ip: string) {
    const school = await this.schoolBySubdomain(subdomain);
    this.trackLimiter.check(`${school.id}:${ip}`);
    const app = await this.prisma.client.application.findFirst({
      where: { schoolId: school.id, applicationNumber: input.applicationNumber.toUpperCase() },
      include: {
        class: { select: { name: true } },
        cycle: { select: { name: true } },
      },
    });
    const contact = input.contact.trim().toLowerCase();
    const matches =
      app &&
      ((app.guardianEmail && app.guardianEmail === contact) ||
        (digits(contact).length >= 7 && digits(app.guardianPhone).endsWith(digits(contact).slice(-9))));
    // Same answer for "no such application" and "wrong contact": no probing.
    if (!app || !matches) throw new NotFoundException("No application matches those details.");
    const showDecision = ["ACCEPTED", "WAITLISTED", "REJECTED", "ADMITTED"].includes(app.status);
    return {
      applicationNumber: app.applicationNumber,
      applicantName: `${app.firstName} ${app.lastName}`,
      className: app.class.name,
      cycleName: app.cycle.name,
      status: app.status,
      submittedAt: app.submittedAt,
      examDate: app.status === "EXAM_SCHEDULED" ? app.examDate : null,
      examVenue: app.status === "EXAM_SCHEDULED" ? app.examVenue : null,
      decisionNote: showDecision ? app.decisionNote : null,
      feeStatus: app.feeStatus,
      feeDue: Number(app.feeDue),
      currency: school.currency,
    };
  }

  // ------------------------------------------------------------------- admin

  async listCycles(schoolId: string) {
    const cycles = await this.prisma.client.admissionCycle.findMany({
      where: { schoolId },
      orderBy: { opensAt: "desc" },
      include: {
        academicYear: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        classes: { include: { class: { select: { id: true, name: true, level: true } } } },
      },
    });
    const counts = await this.prisma.client.application.groupBy({
      by: ["cycleId", "status"],
      where: { schoolId },
      _count: { _all: true },
    });
    return cycles.map((c) => {
      const byStatus: Record<string, number> = {};
      for (const row of counts.filter((x) => x.cycleId === c.id)) byStatus[row.status] = row._count._all;
      return { ...c, applicationCounts: byStatus };
    });
  }

  private async validateCycleInput(schoolId: string, input: SaveAdmissionCycleInput) {
    const year = await this.prisma.client.academicYear.findFirst({
      where: { id: input.academicYearId, schoolId },
      select: { id: true },
    });
    if (!year) throw new BadRequestException("Choose an academic year of this school.");
    if (input.termId) {
      const term = await this.prisma.client.term.findFirst({
        where: { id: input.termId, academicYearId: year.id },
        select: { id: true },
      });
      if (!term) throw new BadRequestException("Choose a term that belongs to that academic year.");
    }
    const classCount = await this.prisma.client.class.count({
      where: {
        id: { in: input.classes.map((c) => c.classId) },
        schoolId,
        isActive: true,
        deletedAt: null,
      },
    });
    if (classCount !== input.classes.length) {
      throw new BadRequestException("Choose active classes that belong to this school.");
    }
  }

  async createCycle(schoolId: string, input: SaveAdmissionCycleInput) {
    await this.validateCycleInput(schoolId, input);
    const clash = await this.prisma.client.admissionCycle.findFirst({
      where: { schoolId, name: input.name },
      select: { id: true },
    });
    if (clash) throw new ConflictException("An intake with this name already exists.");
    const created = await this.prisma.client.admissionCycle.create({
      data: {
        schoolId,
        name: input.name,
        academicYearId: input.academicYearId,
        termId: input.termId ?? null,
        opensAt: startOfDay(input.opensAt),
        closesAt: endOfDay(input.closesAt),
        status: input.status ?? "DRAFT",
        examMaxScore: input.examMaxScore,
        passMark: input.passMark,
        admissionFee: input.admissionFee,
        instructions: input.instructions || null,
        classes: {
          create: input.classes.map((c) => ({ classId: c.classId, seats: c.seats ?? null })),
        },
      },
    });
    return created;
  }

  async updateCycle(schoolId: string, id: string, input: SaveAdmissionCycleInput) {
    const existing = await this.prisma.client.admissionCycle.findFirst({
      where: { id, schoolId },
      include: { classes: true },
    });
    if (!existing) throw new NotFoundException("Intake not found.");
    await this.validateCycleInput(schoolId, input);
    const clash = await this.prisma.client.admissionCycle.findFirst({
      where: { schoolId, name: input.name, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw new ConflictException("An intake with this name already exists.");

    const keep = new Set(input.classes.map((c) => c.classId));
    const removed = existing.classes.filter((c) => !keep.has(c.classId));
    if (removed.length) {
      const used = await this.prisma.client.application.count({
        where: { cycleClassId: { in: removed.map((c) => c.id) } },
      });
      if (used > 0) {
        throw new ConflictException(
          "A class that already has applications cannot be removed from the intake. Close the intake instead.",
        );
      }
    }
    return this.prisma.client.$transaction(async (tx) => {
      await tx.admissionCycleClass.deleteMany({
        where: { id: { in: removed.map((c) => c.id) } },
      });
      for (const row of input.classes) {
        await tx.admissionCycleClass.upsert({
          where: { cycleId_classId: { cycleId: id, classId: row.classId } },
          create: { cycleId: id, classId: row.classId, seats: row.seats ?? null },
          update: { seats: row.seats ?? null },
        });
      }
      // A new fee applies to everyone who has not settled yet; payments and
      // exemptions already recorded keep the amount they were made at.
      if (!existing.admissionFee.equals(input.admissionFee)) {
        await tx.application.updateMany({
          where: { cycleId: id, feeStatus: { in: ["PENDING", "NOT_REQUIRED"] } },
          data: {
            feeDue: input.admissionFee,
            feeStatus: input.admissionFee > 0 ? "PENDING" : "NOT_REQUIRED",
          },
        });
      }
      return tx.admissionCycle.update({
        where: { id },
        data: {
          name: input.name,
          academicYearId: input.academicYearId,
          termId: input.termId ?? null,
          opensAt: startOfDay(input.opensAt),
          closesAt: endOfDay(input.closesAt),
          status: input.status ?? existing.status,
          examMaxScore: input.examMaxScore,
          passMark: input.passMark,
          admissionFee: input.admissionFee,
          instructions: input.instructions || null,
        },
      });
    });
  }

  async listApplications(
    schoolId: string,
    q: {
      cycleId?: string;
      classId?: string;
      status?: string;
      feeStatus?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 25));
    const where: Prisma.ApplicationWhereInput = {
      schoolId,
      ...(q.cycleId ? { cycleId: q.cycleId } : {}),
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.feeStatus ? { feeStatus: q.feeStatus as never } : {}),
      ...(q.search
        ? {
            OR: [
              { applicationNumber: { contains: q.search, mode: "insensitive" } },
              { firstName: { contains: q.search, mode: "insensitive" } },
              { lastName: { contains: q.search, mode: "insensitive" } },
              { guardianPhone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.application.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          class: { select: { id: true, name: true } },
          cycle: { select: { id: true, name: true, passMark: true, examMaxScore: true } },
        },
      }),
      this.prisma.client.application.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async requireApplication(schoolId: string, id: string) {
    const app = await this.prisma.client.application.findFirst({
      where: { id, schoolId },
      include: {
        cycle: true,
        cycleClass: { select: { id: true, seats: true } },
        class: { select: { id: true, name: true } },
      },
    });
    if (!app) throw new NotFoundException("Application not found.");
    return app;
  }

  async getApplication(schoolId: string, id: string) {
    return this.requireApplication(schoolId, id);
  }

  async markUnderReview(schoolId: string, id: string) {
    const app = await this.requireApplication(schoolId, id);
    if (app.status !== "SUBMITTED") {
      throw new ConflictException("Only a newly submitted application can be moved to review.");
    }
    return this.prisma.client.application.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
  }

  async scheduleExam(schoolId: string, input: ScheduleExamInput) {
    const apps = await this.prisma.client.application.findMany({
      where: { schoolId, id: { in: input.applicationIds } },
      select: { id: true, status: true },
    });
    const eligible = ["SUBMITTED", "UNDER_REVIEW", "EXAM_SCHEDULED"];
    if (apps.length !== input.applicationIds.length || apps.some((a) => !eligible.includes(a.status))) {
      throw new ConflictException(
        "Every selected application must belong to this school and be awaiting an exam.",
      );
    }
    const when = new Date(input.examDate.length === 10 ? `${input.examDate}T09:00:00.000Z` : `${input.examDate}:00.000Z`);
    if (Number.isNaN(when.getTime())) throw new BadRequestException("Enter a valid exam date.");
    await this.prisma.client.application.updateMany({
      where: { id: { in: apps.map((a) => a.id) }, schoolId },
      data: { status: "EXAM_SCHEDULED", examDate: when, examVenue: input.venue },
    });
    return { scheduled: apps.length };
  }

  /** Fee is settled when it was paid in cash, waived, or never applied. */
  private assertFeeSettled(app: { feeStatus: string; feeDue: Prisma.Decimal }, doing: string) {
    if (app.feeStatus === "PENDING") {
      throw new ConflictException(
        `The admission fee of ${app.feeDue} is still unpaid. Receive the cash fee or record an exemption before ${doing}.`,
      );
    }
  }

  async recordScore(schoolId: string, id: string, input: RecordExamScoreInput) {
    const app = await this.requireApplication(schoolId, id);
    this.assertFeeSettled(app, "recording the exam score");
    if (!["EXAM_SCHEDULED", "EXAM_COMPLETED"].includes(app.status)) {
      throw new ConflictException("Schedule the entrance exam before recording a score.");
    }
    if (input.score > Number(app.cycle.examMaxScore)) {
      throw new BadRequestException(`The score cannot be above ${app.cycle.examMaxScore}.`);
    }
    return this.prisma.client.application.update({
      where: { id },
      data: { examScore: input.score, status: "EXAM_COMPLETED" },
    });
  }

  async decide(schoolId: string, actorId: string, id: string, input: DecideApplicationInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const app = await tx.application.findFirst({
        where: { id, schoolId },
        include: { cycle: true, cycleClass: true },
      });
      if (!app) throw new NotFoundException("Application not found.");
      if (["ADMITTED", "WITHDRAWN"].includes(app.status)) {
        throw new ConflictException("This application is already closed.");
      }

      if (input.decision === "ACCEPTED") {
        this.assertFeeSettled(app, "accepting the applicant");
        const score = app.examScore === null ? null : Number(app.examScore);
        const passed = score !== null && score >= Number(app.cycle.passMark);
        if (!passed && !input.overridePassMark) {
          throw new BadRequestException(
            score === null
              ? "Record the entrance exam score before accepting, or override with a reason."
              : `The score (${score}) is below the pass mark (${app.cycle.passMark}). Waitlist or reject, or override with a reason.`,
          );
        }
        if (app.cycleClass.seats !== null) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${app.cycleClassId}))`;
          const taken = await tx.application.count({
            where: {
              cycleClassId: app.cycleClassId,
              status: { in: ["ACCEPTED", "ADMITTED"] },
              NOT: { id },
            },
          });
          if (taken >= app.cycleClass.seats) {
            throw new ConflictException(
              `All ${app.cycleClass.seats} seats for ${app.classId ? "this class" : "the class"} are taken. Waitlist the applicant instead.`,
            );
          }
        }
      }

      const updated = await tx.application.update({
        where: { id },
        data: {
          status: input.decision,
          decisionNote: input.note || null,
          decidedAt: new Date(),
          decidedById: actorId,
        },
      });
      await this.credentials.audit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "APPLICATION",
        entityId: id,
        details: { decision: input.decision, overridePassMark: input.overridePassMark },
      });
      return updated;
    });
  }

  // ------------------------------------------------------------ admission fee
  //
  // The fee is paid in CASH when the applicant comes to write the entrance
  // exam. It is school income from the moment it is received and is never
  // refunded: rejecting, waitlisting or withdrawing an application does not
  // touch it, and no refund operation exists on purpose.

  /** Cash received: record a numbered receipt and post the amount to the income ledger. */
  async receiveFee(
    schoolId: string,
    actorId: string,
    id: string,
    input: ReceiveAdmissionFeeInput,
  ) {
    const paidOn = input.paymentDate ? new Date(`${input.paymentDate}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (paidOn.getTime() > Date.now()) {
      throw new BadRequestException("The payment date cannot be in the future.");
    }
    return this.prisma.client.$transaction(async (tx) => {
      const app = await tx.application.findFirst({ where: { id, schoolId } });
      if (!app) throw new NotFoundException("Application not found.");
      if (app.feeStatus === "PAID") throw new ConflictException("The fee has already been received.");
      if (app.feeStatus === "EXEMPTED") {
        throw new ConflictException("This applicant is exempted. Withdraw the exemption first to collect a fee.");
      }
      if (app.feeStatus === "NOT_REQUIRED") {
        throw new ConflictException("No admission fee is set for this intake.");
      }

      const yy = String(paidOn.getUTCFullYear()).slice(-2);
      const prefix = `AFR-${yy}-`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${prefix}))`;
      const last = await tx.application.findFirst({
        where: { schoolId, feeReceiptNumber: { startsWith: prefix } },
        orderBy: { feeReceiptNumber: "desc" },
        select: { feeReceiptNumber: true },
      });
      const seq = last?.feeReceiptNumber ? Number(last.feeReceiptNumber.slice(prefix.length)) + 1 : 1;
      const receiptNumber = `${prefix}${String(seq).padStart(5, "0")}`;

      // Claim first: a double click or a second cashier cannot take the fee twice.
      const claimed = await tx.application.updateMany({
        where: { id, schoolId, feeStatus: "PENDING" },
        data: {
          feeStatus: "PAID",
          feePaidAmount: app.feeDue,
          feePaidAt: paidOn,
          feeReceiptNumber: receiptNumber,
          feeNotes: input.notes || null,
          feeReceivedById: actorId,
        },
      });
      if (claimed.count !== 1) throw new ConflictException("The fee has already been received.");

      const ledger = await this.finance.postIncome(tx, {
        schoolId,
        amount: app.feeDue,
        date: paidOn,
        description: `Admission fee - ${app.firstName} ${app.lastName} (${app.applicationNumber})`,
        category: "ADMISSION_FEE",
        revenueAccount: { name: "Admission Fees", code: "4200" },
        referenceType: "ADMISSION_APPLICATION",
        referenceId: app.id,
        referenceNumber: receiptNumber,
        notes: input.notes || undefined,
      });
      const updated = await tx.application.update({
        where: { id },
        data: { feeTransactionId: ledger.id },
      });
      await this.credentials.audit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "APPLICATION_FEE",
        entityId: id,
        details: { event: "RECEIVED", amount: app.feeDue.toString(), receiptNumber },
      });
      return {
        application: updated,
        receipt: {
          receiptNumber,
          amount: app.feeDue,
          paidOn,
          transactionNumber: ledger.transactionNumber,
        },
      };
    });
  }

  /** Waive the fee. Owner/admin only, and the reason is mandatory. */
  async exemptFee(schoolId: string, actorId: string, id: string, input: ExemptAdmissionFeeInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.application.updateMany({
        where: { id, schoolId, feeStatus: "PENDING" },
        data: {
          feeStatus: "EXEMPTED",
          feeExemptionReason: input.reason,
          feeExemptedById: actorId,
          feeExemptedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        const app = await tx.application.findFirst({ where: { id, schoolId }, select: { feeStatus: true } });
        if (!app) throw new NotFoundException("Application not found.");
        throw new ConflictException(
          app.feeStatus === "PAID"
            ? "The fee was already paid; paid fees are not refunded or waived."
            : app.feeStatus === "EXEMPTED"
              ? "This applicant is already exempted."
              : "No admission fee is set for this intake, so there is nothing to waive.",
        );
      }
      await this.credentials.audit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "APPLICATION_FEE",
        entityId: id,
        details: { event: "EXEMPTED", reason: input.reason },
      });
      return tx.application.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Undo an exemption so the fee becomes payable again. */
  async withdrawExemption(schoolId: string, actorId: string, id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const app = await tx.application.findFirst({ where: { id, schoolId } });
      if (!app) throw new NotFoundException("Application not found.");
      if (app.feeStatus !== "EXEMPTED") throw new ConflictException("This applicant is not exempted.");
      if (app.status === "ADMITTED") {
        throw new ConflictException("The applicant is already admitted; the exemption stands.");
      }
      await this.credentials.audit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "APPLICATION_FEE",
        entityId: id,
        details: { event: "EXEMPTION_WITHDRAWN", previousReason: app.feeExemptionReason },
      });
      return tx.application.update({
        where: { id },
        data: {
          feeStatus: app.feeDue.gt(0) ? "PENDING" : "NOT_REQUIRED",
          feeExemptionReason: null,
          feeExemptedById: null,
          feeExemptedAt: null,
        },
      });
    });
  }

  async feeSummary(schoolId: string, cycleId?: string) {
    const rows = await this.prisma.client.application.groupBy({
      by: ["feeStatus"],
      where: { schoolId, ...(cycleId ? { cycleId } : {}) },
      _count: { _all: true },
      _sum: { feeDue: true, feePaidAmount: true },
    });
    const get = (status: string) => rows.find((r) => r.feeStatus === status);
    const num = (value: Prisma.Decimal | null | undefined) => Number(value ?? 0);
    return {
      collected: num(get("PAID")?._sum.feePaidAmount),
      collectedCount: get("PAID")?._count._all ?? 0,
      pending: num(get("PENDING")?._sum.feeDue),
      pendingCount: get("PENDING")?._count._all ?? 0,
      exemptedCount: get("EXEMPTED")?._count._all ?? 0,
      waived: num(get("EXEMPTED")?._sum.feeDue),
    };
  }

  /**
   * Grant admission: creates the student record, class placement, the
   * student's portal login and (if an email was given) the guardian's portal
   * login, then marks the application ADMITTED - all in one transaction.
   */
  async admit(
    school: Pick<School, "id" | "organizationId" | "subdomain">,
    actorId: string,
    id: string,
    input: AdmitApplicationInput,
  ) {
    const app = await this.requireApplication(school.id, id);
    if (app.status !== "ACCEPTED" || app.studentId) {
      throw new ConflictException("Only an accepted application can be admitted, and only once.");
    }
    this.assertFeeSettled(app, "granting admission");
    const studentInput = createStudentSchema.parse({
      firstName: app.firstName,
      lastName: app.lastName,
      otherNames: app.otherNames ?? undefined,
      gender: app.gender,
      dateOfBirth: app.dateOfBirth.toISOString().slice(0, 10),
      nationality: app.nationality,
      residentialAddress: app.residentialAddress ?? undefined,
      city: app.city ?? undefined,
      region: app.region ?? undefined,
      classId: app.classId,
      // Place the student in the intake's term (or the current term if none is set).
      academicYearId: app.cycle.termId ? app.cycle.academicYearId : undefined,
      termId: app.cycle.termId ?? undefined,
      houseId: input.houseId,
      guardians: [
        {
          firstName: app.guardianFirstName,
          lastName: app.guardianLastName,
          phone: app.guardianPhone,
          email: app.guardianEmail ?? "",
          relationshipType: app.guardianRelationship,
          isPrimary: true,
          createLogin: Boolean(app.guardianEmail),
        },
      ],
    });

    const result = await this.students.createStudent(school, actorId, studentInput, {
      // The intake's term is admin policy, not a per-role restriction.
      role: "admin",
      afterCreate: async (tx, student) => {
        const claimed = await tx.application.updateMany({
          where: { id, schoolId: school.id, status: "ACCEPTED", studentId: null },
          data: { status: "ADMITTED", studentId: student.id, admittedAt: new Date() },
        });
        // Lost a race with another admit click: roll everything back.
        if (claimed.count !== 1) {
          throw new ConflictException("This application was already admitted.");
        }
      },
    });
    return { applicationId: id, applicationNumber: app.applicationNumber, student: result };
  }
}
