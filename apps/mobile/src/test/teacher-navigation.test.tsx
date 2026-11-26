import { Text } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  act,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import type { TabBarProps } from "@/components/PortalTabBar";
import TeacherLayout from "../../app/(teacher)/_layout";

jest.mock("@/features/shared/queries", () => ({
  useNotificationsQuery: () => ({}),
}));
jest.mock("@/features/teacher/RegisterSync", () => ({
  RegisterSyncProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("@/components/PortalTabBar", () => ({
  PortalTabBar: ({
    state,
    descriptors,
    parentTabs,
  }: TabBarProps & { parentTabs: Record<string, string> }) => {
    const { Text: TabState } =
      jest.requireActual<typeof import("react-native")>("react-native");
    const { detailTabButton } = jest.requireActual<
      typeof import("@/components/detailTabButton")
    >("@/components/detailTabButton");
    const route = state.routes[state.index];
    if (!route) return null;
    return (
      <TabState testID="tab-state">
        {[
          parentTabs[route.name],
          descriptors[route.key]?.options.tabBarButton === detailTabButton
            ? "detail"
            : "tab",
        ]
          .filter(Boolean)
          .join(":")}
      </TabState>
    );
  },
}));

function TestPortalTool() {
  return <Text>{useLocalSearchParams().tool}</Text>;
}

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
      "(teacher)/teacher-messages": () => <Text>School messages</Text>,
      "(teacher)/teacher-class-directory": () => <Text>class-directory</Text>,
      "(teacher)/teacher-students": () => <Text>students</Text>,
      "(teacher)/teacher-subjects": () => <Text>subjects</Text>,
      "(teacher)/teacher-school-reports": () => <Text>school-reports</Text>,
      "(teacher)/teacher-external-exams": () => <Text>external-exams</Text>,
      "(teacher)/teacher-tools/_layout": () => (
        <Stack screenOptions={{ headerShown: false }} />
      ),
      "(teacher)/teacher-tools/[tool]": TestPortalTool,
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
  await act(async () => router.navigate("/(teacher)/teacher-more"));
  await act(async () => router.push("/(teacher)/teacher-messages"));
  expect(screen.getByText("School messages")).toBeVisible();
  expect(screen.getByTestId("tab-state")).toHaveTextContent("index:detail");
  await testRouter.back("/teacher-more");
  await act(async () =>
    router.push({
      pathname: "/(teacher)/teacher-tools/[tool]",
      params: { tool: "profile" },
    }),
  );
  expect(screen.getByText("profile")).toBeVisible();
  expect(screen.getByTestId("tab-state")).toHaveTextContent("index:detail");
  await testRouter.back("/teacher-more");
  await act(async () => router.navigate("/(teacher)/teacher-assess"));
  await act(async () => router.push("/(teacher)/teacher-external-exams"));
  expect(screen.getByText("external-exams")).toBeVisible();
  expect(screen.getByTestId("tab-state")).toHaveTextContent(
    "teacher-assess:detail",
  );
  await testRouter.back("/teacher-assess");
});
