import { invoke } from "@tauri-apps/api/core";
import { DESKTOP_ACCESS_EVENT, desktopAccessIssue } from "./access";

export const DESKTOP_SESSION_NOTICE = "schoolhub:desktop-session-notice";
export const selectDesktopSchool = (school: string) =>
  invoke<void>("desktop_select_school", { school });
export const rememberDesktopSession = () =>
  invoke<void>("desktop_remember_session");
export const forgetDesktopSession = (school: string, address: string) =>
  invoke<void>("desktop_forget_session", { school, address });
export async function resumeDesktopSession(school: string, address: string) {
  const response = await invoke<{ status: number; body: number[] }>(
    "desktop_resume_session",
    { school, address },
  );
  const data = JSON.parse(
    new TextDecoder().decode(new Uint8Array(response.body)),
  ) as {
    user?: { role?: string | null; mustChangePassword?: boolean | null };
    message?: string;
  };
  const issue = desktopAccessIssue(response.status, data);
  if (issue)
    window.dispatchEvent(
      new CustomEvent(DESKTOP_ACCESS_EVENT, { detail: issue }),
    );
  if (response.status !== 200 || !data.user)
    throw new Error(
      data.message ??
        "The saved sign-in could not be restored. Sign in with your password.",
    );
  return data.user;
}
export function savedSignInWarning() {
  window.dispatchEvent(
    new CustomEvent(DESKTOP_SESSION_NOTICE, {
      detail:
        "You are signed in, but this computer could not save your sign-in. You will need to sign in again after restarting.",
    }),
  );
}

export async function registerDesktopDevice() {
  const response = await invoke<{ status: number; body: number[] }>("desktop_register_device", { name: "SchoolHub Desktop" });
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(response.body))) as { id?: string; message?: string };
  const issue = desktopAccessIssue(response.status, data);
  if (issue) window.dispatchEvent(new CustomEvent(DESKTOP_ACCESS_EVENT, { detail: issue }));
  if (response.status < 200 || response.status >= 300 || !data.id) throw new Error(data.message ?? "Installation registration failed. Try again when connected.");
  return data.id;
}
