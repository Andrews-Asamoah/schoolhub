import { RoleChoices } from "@/features/auth/role-choice";
import { AuthPage, AuthExit } from "@/features/auth/ui";
export default function RoleSelection() {
  return (
    <AuthPage
      title="How are you joining?"
      detail="Choose one of the roles assigned to your school account."
    >
      <RoleChoices />
      <AuthExit />
    </AuthPage>
  );
}
