import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FinanceAccountPurpose } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { withSerializableRetry } from "./finance.helpers.js";

const accountTypes: Record<FinanceAccountPurpose, "ASSET" | "REVENUE" | "EXPENSE" | "LIABILITY"> = {
  STUDENT_RECEIVABLE: "ASSET",
  FEE_REVENUE: "REVENUE",
  BAD_DEBT_EXPENSE: "EXPENSE",
  CONCESSION_EXPENSE: "EXPENSE",
  DEFERRED_REVENUE: "LIABILITY",
  STUDENT_CREDIT_LIABILITY: "LIABILITY",
};
const day = (date: Date) => date.toISOString().slice(0, 10);
function dateValue(raw: string): Date {
  const value = new Date(raw + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(value.getTime()) || day(value) !== raw) {
    throw new BadRequestException("Supply a valid calendar date in YYYY-MM-DD format.");
  }
  return value;
}

/**
 * A draft is prepared by an accountant and explicitly verified by a different
 * school owner/headteacher. No mappings are automatically guessed or created.
 */
@Injectable()
export class FinanceAccountPurposeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    return this.prisma.client.financeAccountMapping.findMany({
      where: { schoolId },
      include: { account: { select: { id: true, code: true, name: true, accountType: true, isActive: true } } },
      orderBy: [{ purpose: "asc" }, { effectiveFrom: "desc" }],
    });
  }

  async propose(schoolId: string, actorId: string, input: {
    purpose: FinanceAccountPurpose; accountId: string; effectiveFrom: string;
    effectiveTo?: string | null; sourceNote: string;
  }) {
    const start = dateValue(input.effectiveFrom);
    const end = input.effectiveTo ? dateValue(input.effectiveTo) : null;
    if (end && end < start) throw new BadRequestException("Mapping end date cannot precede its start.");
    if (input.effectiveFrom < day(new Date())) {
      throw new BadRequestException("Do not retroactively replace a system mapping; use a reviewed correction.");
    }
    if (input.sourceNote.trim().length < 10) {
      throw new BadRequestException("Explain why this chart account is suitable in at least 10 characters.");
    }
    const account = await this.prisma.client.chartAccount.findFirst({
      where: { schoolId, id: input.accountId, isActive: true },
      select: { id: true, accountType: true, category: true },
    });
    if (!account) throw new NotFoundException("Account is not active in this school.");
    if (account.accountType !== accountTypes[input.purpose]) {
      throw new BadRequestException("Account type does not match the required finance purpose.");
    }
    if (input.purpose === "STUDENT_RECEIVABLE" && account.category !== "ACCOUNTS_RECEIVABLE") {
      throw new BadRequestException("Student receivables require the accounts-receivable control account category.");
    }
    return this.prisma.client.financeAccountMapping.create({
      data: {
        schoolId, accountId: account.id, purpose: input.purpose,
        effectiveFrom: start, effectiveTo: end, sourceNote: input.sourceNote.trim(),
        createdById: actorId, status: "DRAFT",
      },
    });
  }

  async approve(
    schoolId: string, actorId: string, mappingId: string,
    schoolRole: string | undefined, isSuperAdmin: boolean,
  ) {
    if (!isSuperAdmin && schoolRole !== "owner" && schoolRole !== "headteacher") {
      throw new ForbiddenException("A school owner or headteacher must verify system account mappings.");
    }
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-account-purpose'))`;
      const mapping = await tx.financeAccountMapping.findFirst({
        where: { schoolId, id: mappingId }, include: { account: true },
      });
      if (!mapping) throw new NotFoundException("Finance account mapping not found.");
      if (mapping.status !== "DRAFT") throw new ConflictException("Only a draft mapping may be approved.");
      if (mapping.createdById === actorId) throw new ForbiddenException("The preparer cannot approve their own account mapping.");
      if (!mapping.account.isActive || mapping.account.schoolId !== schoolId ||
        mapping.account.accountType !== accountTypes[mapping.purpose]) {
        throw new ConflictException("The mapped chart account is no longer eligible.");
      }
      if (mapping.purpose === "STUDENT_RECEIVABLE" && mapping.account.category !== "ACCOUNTS_RECEIVABLE") {
        throw new ConflictException("Receivables must use a control account.");
      }
      const overlap = await tx.financeAccountMapping.findFirst({
        where: {
          schoolId, purpose: mapping.purpose, status: "ACTIVE", id: { not: mapping.id },
          effectiveFrom: { lte: mapping.effectiveTo ?? new Date("9999-12-31T00:00:00Z") },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: mapping.effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictException("An active account mapping already covers the proposed dates.");
      return tx.financeAccountMapping.update({
        where: { id: mapping.id },
        data: { status: "ACTIVE", approvedById: actorId, approvedAt: new Date() },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  /** Safe shared account resolver for subsequent P3/P4 money-moving services. */
  async resolve(
    tx: Prisma.TransactionClient, schoolId: string,
    purpose: FinanceAccountPurpose, postingDate: Date,
  ) {
    const effective = new Date(day(postingDate) + "T00:00:00.000Z");
    const mappings = await tx.financeAccountMapping.findMany({
      where: {
        schoolId, purpose, status: "ACTIVE", effectiveFrom: { lte: effective },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effective } }],
      },
      include: { account: true }, take: 2,
    });
    if (mappings.length !== 1) {
      throw new ConflictException("Exactly one independently approved system account mapping is required for " + purpose + ".");
    }
    const account = mappings[0]!.account;
    if (!account.isActive || account.schoolId !== schoolId || account.accountType !== accountTypes[purpose]) {
      throw new ConflictException("The verified system account no longer matches its approved purpose.");
    }
    return account;
  }
}
