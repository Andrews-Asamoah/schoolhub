import { Text } from "react-native";
import { router } from "expo-router";
import {
  act,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import TeacherLayout from "../../app/(teacher)/_layout";

jest.mock("@/features/shared/queries", () => ({
  useNotificationsQuery: () => ({}),
}));
jest.mock("@/features/teacher/RegisterSync", () => ({
  RegisterSyncProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("@/components/PortalTabBar", () => ({ PortalTabBar: () => null }));

test("the actual teacher navigator opens a detail and returns to its previous tab", async () => {
  const result = await renderRouter(
    {
      "(teacher)/_layout": TeacherLayout,
      "(teacher)/index": () => <Text>Teacher Home</Text>,
      "(teacher)/teacher-classes": () => <Text>Teacher Classes</Text>,
      "(teacher)/teacher-register": () => <Text>Class Register</Text>,
      "(teacher)/teacher-score-entry": () => <Text>Score Entry</Text>,
      "(teacher)/teacher-report-review": () => <Text>Report Review</Text>,
      "(teacher)/teacher-report-archive": () => <Text>Report Archive</Text>,
      "(teacher)/teacher-mock-analysis": () => <Text>Mock Analysis</Text>,
      "(teacher)/teacher-assess": () => <Text>Assess</Text>,
      "(teacher)/teacher-assignments": () => <Text>Assignments</Text>,
      "(teacher)/teacher-more": () => <Text>More</Text>,
      "(teacher)/teacher-roster": () => <Text>Class Roster</Text>,
      "(teacher)/teacher-pupil": () => <Text>Pupil</Text>,
      "(teacher)/teacher-timetable": () => <Text>Timetable</Text>,
      "(teacher)/teacher-assignment-new": () => <Text>New Assignment</Text>,
      "(teacher)/teacher-assignment": () => <Text>Assignment</Text>,
      "(teacher)/teacher-clubs": () => <Text>Clubs</Text>,
      "(teacher)/teacher-announcement-new": () => <Text>New Announcement</Text>,
      "(teacher)/teacher-documents": () => <Text>Documents</Text>,
    },
    { initialUrl: "/teacher-classes" },
  );
  await act(async () =>
    router.push({
      pathname: "/(teacher)/teacher-register",
      params: { classId: "class-1" },
    }),
  );
  expect(screen.getByText("Class Register")).toBeVisible();
  expect(result.getSearchParams()).toEqual({ classId: "class-1" });
  await testRouter.back("/teacher-classes");

  await act(async () =>
    router.push({
      pathname: "/(teacher)/teacher-score-entry",
      params: { classId: "class-1", subjectId: "math" },
    }),
  );
  expect(screen.getByText("Score Entry")).toBeVisible();
  await act(async () => router.push("/(teacher)/teacher-report-review"));
  expect(screen.getByText("Report Review")).toBeVisible();
});
