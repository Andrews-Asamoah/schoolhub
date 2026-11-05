import { QueryClient } from "@tanstack/react-query";
export function createQueryClient(){
 return new QueryClient({defaultOptions:{queries:{staleTime:60_000,retry:1}}});
}
/** Live active-context reference for diagnostics and non-component integrations. */
export let queryClient=createQueryClient();
export function activateQueryClient(client:QueryClient){queryClient=client;}
