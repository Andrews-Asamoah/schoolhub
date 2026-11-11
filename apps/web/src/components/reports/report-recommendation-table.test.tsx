import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReportRecommendationTable, type RecommendationTableRow } from "./report-recommendation-table";

const base: RecommendationTableRow = {
  id: "v1", pupilName: "Ama Mensah", admissionNumber: "ADM-001", context: "Term 1 · v1",
  average: 72.456, position: 2, classSize: 30, subjects: [{ name: "Mathematics", grade: "B", percentage: 71 }],
  statusLabel: "Recommendation needed", editable: true,
};

function render(rows: RecommendationTableRow[], remarks: Record<string, string> = {}, states = {}) {
  return renderToStaticMarkup(
    <ReportRecommendationTable rows={rows} remarks={remarks} onRemarkChange={vi.fn()} rowStates={states}
      selected={new Set()} onToggleRow={vi.fn()} onToggleAll={vi.fn()} onSubmitRow={vi.fn()} submitLabel="Sign off" />,
  );
}

describe("ReportRecommendationTable", () => {
  it("shows pupil, average to one decimal and position with class size", () => {
    const html = render([base]);
    expect(html).toContain("Ama Mensah");
    expect(html).toContain("72.5");
    expect(html).toContain("2nd");
    expect(html).toContain("/ 30");
  });

  it("uses the right ordinal suffix for 11th, 12th, 13th and 21st", () => {
    const html = render([11, 12, 13, 21].map((position) => ({ ...base, id: `p${position}`, position })));
    for (const text of ["11th", "12th", "13th", "21st"]) expect(html).toContain(text);
  });

  it("shows a dash when the average or position is not available", () => {
    const html = render([{ ...base, average: null, position: null, classSize: null }]);
    expect(html).not.toContain("NaN");
    expect(html.match(/>—</g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("gives an editable row a text box, and a read-only row the recorded text instead", () => {
    const editable = render([base], { v1: "Keep it up" });
    expect(editable).toContain("<textarea");
    expect(editable).toContain("Keep it up");
    const locked = render([{ ...base, editable: false, recordedRemark: { label: "Your recommendation", text: "Excellent term." } }]);
    expect(locked).not.toContain("<textarea");
    expect(locked).toContain("Excellent term.");
  });

  it("disables sign-off until the recommendation has at least 10 characters", () => {
    expect(render([base], { v1: "short" })).toMatch(/<button[^>]*\sdisabled=""[^>]*>Sign off/);
    expect(render([base], { v1: "Works hard and improves." })).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Sign off/);
  });

  it("shows an error on the row that failed without disabling other rows", () => {
    const other = { ...base, id: "v2", pupilName: "Kofi Boateng" };
    const html = render([base, other], { v1: "Works hard and improves.", v2: "Works hard and improves." }, { v1: { error: "Superseded." } });
    expect(html).toContain("Superseded.");
    expect(html.match(/>Sign off</g)).toHaveLength(2);
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Sign off/);
  });

  it("keeps a row's checkbox disabled when it cannot be signed off", () => {
    const html = render([{ ...base, editable: false }]);
    expect(html).toMatch(/aria-label="Select Ama Mensah"[^>]*disabled/);
  });
});
