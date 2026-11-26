import { router, type Href } from "expo-router";
import { sessionStore } from "./session";
import type { MobileRole } from "./permissions";

export function portalToolHref(role: MobileRole, path: string): Href {
  const [first, second] = path.replace(/^\//, "").split("/");
  const tool =
    first === "security" && second === "change-password"
      ? "change-password"
      : first === "announcements" && second
        ? "announcement"
        : first;
  return {
    pathname: `/(${role})/${role}-tools/[tool]`,
    params: {
      tool: tool || "profile",
      ...(tool === "announcement" && second ? { id: second } : {}),
    },
  } as Href;
}

export function openPortalTool(path: string) {
  const role = sessionStore.getSnapshot().activeRole;
  router.push(role ? portalToolHref(role, path) : ("/" as Href));
}
