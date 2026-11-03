import { submitMyAssignment } from "@/api/student";
import { useScopedMutation } from "@/features/shared/mutations";

export function useSubmitAssignmentMutation(assignmentId: string) {
  return useScopedMutation((input: { responseText: string }) =>
    submitMyAssignment({
      params: { id: assignmentId },
      request: input,
    }),
  );
}
