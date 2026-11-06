import { describe, expect, it } from "vitest";
import { bandRangeLabel } from "./assessment-setup";

describe("bandRangeLabel", () => {
  const cumulative = [4, 11, 23, 40, 60, 77, 89, 96, 100];
  const bands = cumulative.map((maxScore, index) => ({ minScore: index === 0 ? 0 : cumulative[index - 1]!, maxScore }));
  const labels = bands.map((band, index) => bandRangeLabel("CLASS_RANK", band, index, bands.length));

  it("reads a class-ranked scale the way the BECE table does", () => {
    expect(labels).toEqual(["Top 4%", "Next 7%", "Next 12%", "Next 17%", "Next 20%", "Next 17%", "Next 12%", "Next 7%", "Bottom 4%"]);
  });

  it("keeps score bands as a percentage range", () => {
    expect(bandRangeLabel("SCORE_BANDS", { minScore: 80, maxScore: 100 }, 0, 6)).toBe("80–100");
  });
});
