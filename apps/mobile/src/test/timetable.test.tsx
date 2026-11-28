import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Timetable } from "@/features/shared/Timetable";
import { outputTable } from "@/features/shared/exports";

jest.mock("@/features/shared/exports", () => ({
  outputTable: jest.fn(async () => undefined),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("@/theme/theme", () => {
  const actual = jest.requireActual("@/theme/theme");
  const { lightTokens } = jest.requireActual("@/theme/tokens.generated");
  return {
    ...actual,
    useTheme: () => ({ colors: lightTokens, scheme: "light" }),
  };
});

const slot = {
  type: "LESSON",
  subject: null,
  class: { name: "JHS 1" },
  classroom: { name: "Room 4" },
};
const entries = [
  {
    ...slot,
    id: "sat",
    dayOfWeek: "SATURDAY",
    label: "Revision",
    startTime: "09:00",
    endTime: "10:00",
  },
  {
    ...slot,
    id: "mon",
    dayOfWeek: "MONDAY",
    label: "Science",
    startTime: "08:00",
    endTime: "09:00",
  },
];

test("timetable can show a weekend day and still share the full week", async () => {
  await render(
    <Timetable entries={entries} title="Teaching timetable" showClass />,
  );

  await fireEvent.press(screen.getByRole("tab", { name: "Saturday" }));
  expect(
    screen.getByRole("tab", { name: "Saturday", selected: true }),
  ).toBeVisible();
  expect(screen.getByText("Revision")).toBeVisible();
  expect(screen.queryByText("Science")).toBeNull();
  expect(screen.getByText("09:00–10:00 · JHS 1 · Room 4")).toBeVisible();

  await fireEvent.press(
    screen.getByRole("button", { name: "Share timetable PDF" }),
  );
  await waitFor(() =>
    expect(outputTable).toHaveBeenCalledWith(
      "Teaching timetable",
      ["Day", "Time", "Lesson", "Class", "Room"],
      [
        ["MONDAY", "08:00–09:00", "Science", "JHS 1", "Room 4"],
        ["SATURDAY", "09:00–10:00", "Revision", "JHS 1", "Room 4"],
      ],
      "pdf",
    ),
  );
});
