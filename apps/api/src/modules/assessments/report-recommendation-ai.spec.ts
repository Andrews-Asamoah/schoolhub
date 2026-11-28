import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));

import {
  AI_RECOMMENDATIONS_FEATURE, ReportRecommendationAiService, buildRecommendationInput, schoolHasAiRecommendations,
  type RecommendationProvider,
} from "./report-recommendation-ai.js";
import { MANUAL_RECOMMENDATION, RECOMMENDATION_SOURCES } from "./report-recommendation-source.js";

const now = new Date("2026-11-11T12:00:00Z");
const future = new Date("2027-06-01T00:00:00Z");

function service(school: unknown, provider?: RecommendationProvider) {
  const prisma = { client: { school: { findUnique: vi.fn().mockResolvedValue(school) } } };
  return new ReportRecommendationAiService(prisma as never, provider);
}
const schoolWith = (features: unknown, org = { subscriptionStatus: "ACTIVE", expiresAt: future }) => ({ features, organization: org });
const provider: RecommendationProvider = { id: "test-model", draft: vi.fn().mockResolvedValue({ text: "  Works steadily.  " }) };

describe("schoolHasAiRecommendations", () => {
  it("is off unless the school was explicitly switched on", () => {
    for (const features of [null, undefined, {}, [], "aiRecommendations", 1, { aiRecommendations: false }, { aiRecommendations: "true" }, { aiRecommendations: 1 }]) {
      expect(schoolHasAiRecommendations(features)).toBe(false);
    }
  });

  it("accepts an object flag or a list of enabled names", () => {
    expect(schoolHasAiRecommendations({ [AI_RECOMMENDATIONS_FEATURE]: true })).toBe(true);
    expect(schoolHasAiRecommendations(["other", AI_RECOMMENDATIONS_FEATURE])).toBe(true);
  });
});

describe("ReportRecommendationAiService.status", () => {
  it("is available only with the flag, a subscription in good standing and a provider", async () => {
    expect(await service(schoolWith({ aiRecommendations: true }), provider).status("s1", now)).toEqual({ enabled: true });
  });

  it("is off by default, even with a provider and a paid-up subscription", async () => {
    expect(await service(schoolWith(null), provider).status("s1", now)).toEqual({ enabled: false, reason: "FEATURE_OFF" });
  });

  it("is off for a school that does not exist", async () => {
    expect(await service(null, provider).status("s1", now)).toEqual({ enabled: false, reason: "FEATURE_OFF" });
  });

  it("is off when the subscription is suspended, cancelled or expired", async () => {
    for (const org of [
      { subscriptionStatus: "SUSPENDED", expiresAt: future },
      { subscriptionStatus: "CANCELLED", expiresAt: future },
      { subscriptionStatus: "ACTIVE", expiresAt: new Date("2020-01-01T00:00:00Z") },
    ]) {
      expect(await service(schoolWith({ aiRecommendations: true }, org), provider).status("s1", now))
        .toEqual({ enabled: false, reason: "SUBSCRIPTION_INACTIVE" });
    }
  });

  it("is off when no provider has been built, however the school is set up", async () => {
    expect(await service(schoolWith({ aiRecommendations: true })).status("s1", now)).toEqual({ enabled: false, reason: "NO_PROVIDER" });
  });
});

describe("ReportRecommendationAiService.draft", () => {
  const input = { role: "TEACHER" as const, average: 70, position: 2, classSize: 30, subjects: [] };

  it("refuses, without calling any provider, when the feature is not available", async () => {
    const spy = { id: "spy", draft: vi.fn() };
    await expect(service(schoolWith(null), spy).draft("s1", input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(spy.draft).not.toHaveBeenCalled();
  });

  it("returns the provider's trimmed text and which provider wrote it", async () => {
    const result = await service(schoolWith({ aiRecommendations: true }), provider).draft("s1", input);
    expect(result).toEqual({ text: "Works steadily.", providerId: "test-model" });
    expect(provider.draft).toHaveBeenCalledWith(input);
  });
});

describe("buildRecommendationInput", () => {
  const snapshot = {
    school: { name: "Wesley International School", id: "sch1" },
    student: { id: "stu1", admissionNumber: "ADM-0042", firstName: "Ama", lastName: "Mensah", class: { id: "c1", name: "JHS 1A" } },
    report: {
      summary: { average: 72.5, subjectsGraded: 2, overallPosition: 3, classSize: 30 },
      subjects: [
        { subject: { id: "sub1", name: "Mathematics" }, grade: "B", percentage: 71, teacherName: "Mr Boateng" },
        { subject: { id: "sub2", name: "Science" }, grade: null, percentage: 74 },
      ],
    },
  };

  it("keeps the results and standing", () => {
    expect(buildRecommendationInput(snapshot as never, "HEADTEACHER")).toEqual({
      role: "HEADTEACHER", average: 72.5, position: 3, classSize: 30,
      subjects: [{ name: "Mathematics", grade: "B", percentage: 71 }, { name: "Science", grade: null, percentage: 74 }],
    });
  });

  it("never includes anything that identifies the pupil, the class, the school or a teacher", () => {
    const text = JSON.stringify(buildRecommendationInput(snapshot as never, "TEACHER"));
    for (const identifying of ["Ama", "Mensah", "ADM-0042", "stu1", "JHS 1A", "c1", "Wesley", "sch1", "Boateng"]) {
      expect(text).not.toContain(identifying);
    }
  });

  it("copes with a report with no summary or subjects", () => {
    expect(buildRecommendationInput({ report: {} } as never, "TEACHER"))
      .toEqual({ role: "TEACHER", average: null, position: null, classSize: null, subjects: [] });
  });
});

describe("recommendation sources", () => {
  it("allows only a person's own writing until an assisted source exists", () => {
    expect([...RECOMMENDATION_SOURCES]).toEqual(["MANUAL"]);
    expect(MANUAL_RECOMMENDATION).toBe("MANUAL");
  });
});
