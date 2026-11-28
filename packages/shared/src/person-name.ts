/** A display name from the recorded name parts, in the school's usual order. */
export function formatPersonName(person?: {
  firstName?: string | null;
  otherNames?: string | null;
  lastName?: string | null;
} | null): string {
  return [person?.firstName, person?.otherNames, person?.lastName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(" ");
}
