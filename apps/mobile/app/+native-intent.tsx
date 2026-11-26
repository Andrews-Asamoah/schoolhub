import { redirectRecoveryLink } from "@/features/auth/recovery-link";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return redirectRecoveryLink(path);
}
