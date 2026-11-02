import { Button } from "@/components/Button";
import { validateSchoolSession } from "@/lib/restore-session";
import { AuthPage, AuthExit, useAuthFeedback } from "@/features/auth/ui";
export default function SubscriptionInactive() {
  const feedback = useAuthFeedback();
  return (
    <AuthPage
      title="School access is paused"
      detail="Please contact your school administrator. You can check again after your school’s subscription is restored."
      message={feedback.message}
    >
      <Button
        label="Check school access again"
        onPress={() => void feedback.run(validateSchoolSession)}
      />
      <AuthExit />
    </AuthPage>
  );
}
