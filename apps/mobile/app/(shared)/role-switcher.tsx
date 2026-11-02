import { RoleChoices } from "@/features/auth/role-choice";
import { AuthPage } from "@/features/auth/ui";
export default function RoleSwitcher() {
  return (
    <AuthPage
      title="Switch role"
      detail="Your school assigns the roles available on this account."
    >
      <RoleChoices />
    </AuthPage>
  );
}
