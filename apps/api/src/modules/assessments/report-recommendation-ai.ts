import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { evaluateSubscriptionAccess } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AcademicSnapshot } from "./report-version.js";

/**
 * Groundwork for drafting report recommendations with an AI provider. Nothing here is reachable from a
 * route, and no provider is registered, so nothing can run today. It fixes the three decisions that are
 * hard to retrofit: what a provider is allowed to see, who may switch the feature on, and what a provider
 * looks like, so the feature can be added later without reopening them.
 */

/** The key in `School.features` that a platform administrator sets to true for a school. Off by default. */
export const AI_RECOMMENDATIONS_FEATURE = "aiRecommendations";

/** Injection token for the one provider implementation, registered only when the feature is built. */
export const RECOMMENDATION_PROVIDER = Symbol("RECOMMENDATION_PROVIDER");

/**
 * Everything a provider receives about a pupil. It is deliberately anonymous: marks, grades and standing,
 * never a name, admission number, class, school or id. These are children's records, so a provider only
 * gets what it needs to write about the results, and a pupil cannot be identified from the request.
 */
export interface RecommendationInput {
  /** Whose recommendation is being drafted; the headteacher's reads differently from the class teacher's. */
  role: "TEACHER" | "HEADTEACHER";
  average: number | null;
  position: number | null;
  classSize: number | null;
  subjects: { name: string; grade: string | null; percentage: number }[];
}

export interface RecommendationProvider {
  /** Stable identifier recorded with anything the provider produces, e.g. "acme-model-1". */
  readonly id: string;
  draft(input: RecommendationInput): Promise<{ text: string }>;
}

/** Build a provider's input from a report snapshot, keeping only the anonymous results. */
export function buildRecommendationInput(snapshot: AcademicSnapshot, role: RecommendationInput["role"]): RecommendationInput {
  const report = snapshot.report;
  return {
    role,
    average: report.summary?.average ?? null,
    position: report.summary?.overallPosition ?? null,
    classSize: report.summary?.classSize ?? null,
    subjects: (report.subjects ?? []).map(item => ({ name: item.subject.name, grade: item.grade ?? null, percentage: item.percentage })),
  };
}

/** `School.features` may be an object of flags or a list of enabled names; only an explicit yes counts. */
export function schoolHasAiRecommendations(features: unknown): boolean {
  if (Array.isArray(features)) return features.includes(AI_RECOMMENDATIONS_FEATURE);
  if (features && typeof features === "object") return (features as Record<string, unknown>)[AI_RECOMMENDATIONS_FEATURE] === true;
  return false;
}

export type AiRecommendationStatus =
  | { enabled: true }
  | { enabled: false; reason: "FEATURE_OFF" | "SUBSCRIPTION_INACTIVE" | "NO_PROVIDER" };

@Injectable()
export class ReportRecommendationAiService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(RECOMMENDATION_PROVIDER) private readonly provider?: RecommendationProvider,
  ) {}

  /**
   * Whether drafting is available to a school: the platform administrator switched it on for them, their
   * subscription is in good standing (checked again here because this may run outside a request), and a
   * provider exists. Tying it to a particular plan tier would be one more condition here.
   */
  async status(schoolId: string, now = new Date()): Promise<AiRecommendationStatus> {
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      select: { features: true, organization: { select: { subscriptionStatus: true, expiresAt: true } } },
    });
    if (!school || !schoolHasAiRecommendations(school.features)) return { enabled: false, reason: "FEATURE_OFF" };
    if (!evaluateSubscriptionAccess(school.organization.subscriptionStatus, school.organization.expiresAt, now).allowed) {
      return { enabled: false, reason: "SUBSCRIPTION_INACTIVE" };
    }
    if (!this.provider) return { enabled: false, reason: "NO_PROVIDER" };
    return { enabled: true };
  }

  /**
   * Ask the provider for a draft. The text is only a suggestion: before it can be stored, a source value
   * for it must be added to report-recommendation-source.ts, so it can never be passed off as MANUAL.
   */
  async draft(schoolId: string, input: RecommendationInput) {
    const status = await this.status(schoolId);
    if (!status.enabled || !this.provider) {
      throw new ServiceUnavailableException("Drafting recommendations with AI is not enabled for this school.");
    }
    const result = await this.provider.draft(input);
    return { text: result.text.trim(), providerId: this.provider.id };
  }
}
