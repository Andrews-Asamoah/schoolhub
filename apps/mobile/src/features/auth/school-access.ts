import { getPublicSchool, type SchoolAccessMatch } from "@/api/auth";
import { queryClient } from "@/lib/query-client";

export const SCHOOL_LOOKUP_TIMEOUT = 5_000;
export const schoolBrandingKey = (subdomain: string | null) =>
  ["public-school", subdomain] as const;

export class SchoolLookupTimeout extends Error {}

export async function withSchoolLookupDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error("School lookup cancelled.");
  const controller = new AbortController();
  let stop: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    stop = () => {
      reject(new Error("School lookup cancelled."));
      controller.abort();
    };
    timer = setTimeout(() => {
      reject(new SchoolLookupTimeout());
      controller.abort();
    }, SCHOOL_LOOKUP_TIMEOUT);
    signal?.addEventListener("abort", stop, { once: true });
  });

  try {
    return await Promise.race([
      interrupted,
      Promise.resolve().then(() => request(controller.signal)),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

export function cacheSchoolBranding(school: SchoolAccessMatch) {
  queryClient.setQueryData(schoolBrandingKey(school.subdomain), {
    name: school.name,
    subdomain: school.subdomain,
    logo: school.logo,
    primaryColor: school.primaryColor,
    secondaryColor: school.secondaryColor,
  });
}

export function fetchSchoolBranding(subdomain: string, signal: AbortSignal) {
  return withSchoolLookupDeadline(
    (lookupSignal) =>
      getPublicSchool({ params: { subdomain }, signal: lookupSignal }),
    signal,
  );
}
