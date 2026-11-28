import { printableTable } from "@/features/shared/exports";
import { lessonTiming } from "@/features/shared/TimetableActions";

jest.mock("@/components/Button", () => ({ Button: () => null }));

test("generated print markup escapes pupil and school text", () => {
  const html = printableTable("A & B", ["Pupil"], [["<img src=x>"]]);
  expect(html).toContain("A &amp; B");
  expect(html).toContain("&lt;img src=x&gt;");
  expect(html).not.toContain("<img");
});

test("lesson timing excludes breaks and stops showing the current lesson at its end", () => {
  const slot = {
    dayOfWeek: "MONDAY",
    startTime: "08:00",
    endTime: "08:30",
    label: "Science",
    subject: null,
    type: "LESSON",
  };
  const entries = [
    {
      ...slot,
      label: "Break",
      type: "BREAK",
      startTime: "08:30",
      endTime: "09:00",
    },
    { ...slot, label: "Maths", startTime: "09:00", endTime: "09:30" },
    slot,
  ];
  expect(
    lessonTiming(entries, new Date("2026-11-23T08:15:00Z")).current?.label,
  ).toBe("Science");
  const breakTime = lessonTiming(entries, new Date("2026-11-23T08:30:00Z"));
  expect(breakTime.current).toBeUndefined();
  expect(breakTime.next?.label).toBe("Maths");
});
