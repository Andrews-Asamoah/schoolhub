import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAuthorizedSession } from "@/lib/permissions";
import { sessionStore, useSession } from "@/lib/session";
/** Online mutations are never persisted or automatically replayed. Attendance gets its own audited queue later. */
export function useScopedMutation<TData, TVariables>(
  mutation: (variables: TVariables) => Promise<TData>,
) {
  const session = useSession();
  const queryClient = useQueryClient();
  const scope = ["school", session.subdomain, session.activeRole] as const;
  return useMutation({
    mutationKey: [...scope, "mutation"],
    retry: false,
    networkMode: "always",
    mutationFn: async (variables: TVariables) => {
      const current = sessionStore.getSnapshot();
      if (
        !isAuthorizedSession(current) ||
        current.subdomain !== session.subdomain ||
        current.activeRole !== session.activeRole ||
        current.token !== session.token
      )
        throw new Error("The active school session has changed.");
      const result = await mutation(variables);
      if (sessionStore.getSnapshot().token !== session.token)
        throw new Error("The active school session has changed.");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
    },
  });
}
