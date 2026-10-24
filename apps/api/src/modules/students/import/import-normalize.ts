import {
  STUDENT_IMPORT_COLUMNS,
  normalizedStudentRowSchema,
  type ImportedGuardian,
  type NormalizedStudentRow,
  type StudentImportField,
} from "@schoolhub/shared";

// ---------------------------------------------------------------- headers

/** "First Name*" -> "firstname". Used to match headings however people type them. */
export const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const HEADER_TO_FIELD = new Map<string, StudentImportField>();
for (const column of STUDENT_IMPORT_COLUMNS) {
  HEADER_TO_FIELD.set(normalizeHeader(column.label), column.key);
  for (const alias of column.aliases) HEADER_TO_FIELD.set(alias, column.key);
}

export interface HeaderMapping {
  /** column index -> field */
  fields: Map<number, StudentImportField>;
  recognized: { header: string; field: StudentImportField }[];
  ignored: string[];
  /** Headings that map to a field already taken by an earlier column. */
  duplicated: string[];
  /** Labels of required columns that are missing. */
  missing: string[];
}

export function mapHeaders(headers: string[]): HeaderMapping {
  const fields = new Map<number, StudentImportField>();
  const taken = new Set<StudentImportField>();
  const result: HeaderMapping = { fields, recognized: [], ignored: [], duplicated: [], missing: [] };

  headers.forEach((header, index) => {
    if (!header.trim()) return;
    const field = HEADER_TO_FIELD.get(normalizeHeader(header));
    if (!field) result.ignored.push(header);
    else if (taken.has(field)) result.duplicated.push(header);
    else {
      taken.add(field);
      fields.set(index, field);
      result.recognized.push({ header, field });
    }
  });
  for (const column of STUDENT_IMPORT_COLUMNS) {
    if (column.required && !taken.has(column.key)) result.missing.push(column.label);
  }
  return result;
}

// ------------------------------------------------------------------ text

/** Collapses spaces, drops control and zero-width characters. */
export function cleanText(value: string | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------------- dates

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function ymd(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Reads a date the way schools here write it: day first (25/12/2012). Also accepts
 * 2012-12-25, "25 Dec 2012", "December 25, 2012" and Excel's own date numbers. The
 * result is always YYYY-MM-DD, and impossible dates (31/02/2012) are rejected.
 * Dates are never read month-first, because 03/04/2012 would silently become March.
 */
export function parseDate(input: string): { iso: string } | { error: string } {
  const text = cleanText(input);
  const fail = (message: string) => ({ error: message });
  const bad = fail(`"${text}" isn't a date we recognise. Write it day first, for example 25/12/2012.`);

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) {
    const iso = ymd(Number(match[1]), Number(match[2]), Number(match[3]));
    return iso ? { iso } : fail(`"${text}" isn't a real date.`);
  }
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) {
    const iso = ymd(Number(match[3]), Number(match[2]), Number(match[1]));
    return iso ? { iso } : fail(`"${text}" isn't a real date. Dates are read day first, day/month/year.`);
  }
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2}$/.test(text)) return fail(`"${text}" has a two-digit year. Please use four digits, like 25/12/2012.`);
  match = /^(\d{1,2})(?:st|nd|rd|th)?[ \-/.,]+([A-Za-z]+)\.?[ \-/.,]+(\d{4})$/.exec(text);
  if (match) {
    const month = MONTHS[match[2]!.toLowerCase()];
    const iso = month ? ymd(Number(match[3]), month, Number(match[1])) : null;
    return iso ? { iso } : bad;
  }
  match = /^([A-Za-z]+)\.?[ ]+(\d{1,2})(?:st|nd|rd|th)?,?[ ]+(\d{4})$/.exec(text);
  if (match) {
    const month = MONTHS[match[1]!.toLowerCase()];
    const iso = month ? ymd(Number(match[3]), month, Number(match[2])) : null;
    return iso ? { iso } : bad;
  }
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 10000 && serial <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return { iso: date.toISOString().slice(0, 10) };
    }
  }
  return bad;
}

const todayIso = (now: Date) => now.toISOString().slice(0, 10);
const yearsBetween = (fromIso: string, toIso: string) => {
  const [fy, fm, fd] = fromIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split("-").map(Number) as [number, number, number];
  return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
};

// ---------------------------------------------------------------- values

export function parseGender(value: string): "MALE" | "FEMALE" | "OTHER" | null {
  switch (cleanText(value).toLowerCase().replace(/\./g, "")) {
    case "m": case "male": case "boy": case "b": return "MALE";
    case "f": case "female": case "girl": case "g": return "FEMALE";
    case "o": case "other": return "OTHER";
    default: return null;
  }
}

const RELATIONSHIPS: Record<string, ImportedGuardian["relationshipType"]> = {
  father: "FATHER", dad: "FATHER", papa: "FATHER", mother: "MOTHER", mum: "MOTHER", mom: "MOTHER", mama: "MOTHER", mummy: "MOTHER",
  guardian: "GUARDIAN", guardians: "GUARDIAN", sponsor: "GUARDIAN", sibling: "SIBLING", brother: "SIBLING", sister: "SIBLING",
  grandfather: "GRANDFATHER", grandpa: "GRANDFATHER", grandmother: "GRANDMOTHER", grandma: "GRANDMOTHER",
  uncle: "RELATIVE", aunt: "RELATIVE", aunty: "RELATIVE", auntie: "RELATIVE", cousin: "RELATIVE", relative: "RELATIVE", other: "OTHER",
};

export function parseRelationship(value: string): ImportedGuardian["relationshipType"] | null {
  return RELATIONSHIPS[cleanText(value).toLowerCase()] ?? null;
}

/**
 * Tidies a phone number. Ghanaian numbers become 0XXXXXXXXX (including ones that
 * lost their leading zero in Excel, or were written +233...). Anything else is
 * kept as typed, with a warning if it doesn't look like a phone number.
 */
export function normalizePhone(value: string): { value: string; warning?: string } {
  const raw = cleanText(value);
  if (!raw) return { value: "" };
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (/^233\d{9}$/.test(digits)) return { value: `0${digits.slice(3)}` };
  if (/^0\d{9}$/.test(digits) && !hasPlus) return { value: digits };
  if (/^[235]\d{8}$/.test(digits) && !hasPlus) return { value: `0${digits}` };
  if (digits.length >= 7 && digits.length <= 15) return { value: `${hasPlus ? "+" : ""}${digits}` };
  return { value: raw, warning: `"${raw}" doesn't look like a phone number` };
}

const BLOOD_GROUPS = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

// ------------------------------------------------------------------- row

export interface NormalizedOutcome {
  row: NormalizedStudentRow | null;
  errors: string[];
  warnings: string[];
}

const GUARDIAN_FIELDS = {
  1: { first: "g1FirstName", last: "g1LastName", relationship: "g1Relationship", phone: "g1Phone", email: "g1Email" },
  2: { first: "g2FirstName", last: "g2LastName", relationship: "g2Relationship", phone: "g2Phone", email: "g2Email" },
} as const;

/**
 * Turns one raw spreadsheet row into a clean student, or explains everything that
 * is wrong with it at once so it can be fixed in a single pass.
 */
export function normalizeRecord(
  get: (field: StudentImportField) => string,
  rowNumber: number,
  now: Date = new Date(),
): NormalizedOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = (field: StudentImportField) => cleanText(get(field));

  const name = (field: StudentImportField, label: string) => {
    const value = text(field);
    if (!value) {
      errors.push(`${label} is missing.`);
      return "";
    }
    if (!/\p{L}/u.test(value)) errors.push(`${label} must contain letters.`);
    else if (/^[=+@]/.test(value)) errors.push(`${label} can't start with = + or @.`);
    return value;
  };
  const firstName = name("firstName", "First name");
  const lastName = name("lastName", "Last name");
  const otherNames = text("otherNames");

  const genderText = text("gender");
  const gender = genderText ? parseGender(genderText) : null;
  if (!genderText) errors.push("Gender is missing.");
  else if (!gender) errors.push(`Gender "${genderText}" isn't recognised. Use Male or Female.`);

  let dateOfBirth = "";
  const dobText = text("dateOfBirth");
  if (!dobText) errors.push("Date of birth is missing.");
  else {
    const parsed = parseDate(dobText);
    if ("error" in parsed) errors.push(`Date of birth: ${parsed.error}`);
    else {
      dateOfBirth = parsed.iso;
      const today = todayIso(now);
      if (dateOfBirth > today) errors.push("Date of birth is in the future.");
      else {
        const age = yearsBetween(dateOfBirth, today);
        if (age > 40) errors.push(`Date of birth gives an age of ${age}. Please check it.`);
        else if (age < 2 || age > 25) warnings.push(`Date of birth gives an age of ${age}. Please check it.`);
      }
    }
  }

  let admissionDate: string | undefined;
  const admissionDateText = text("admissionDate");
  if (admissionDateText) {
    const parsed = parseDate(admissionDateText);
    if ("error" in parsed) errors.push(`Admission date: ${parsed.error}`);
    else if (parsed.iso > todayIso(now)) errors.push("Admission date is in the future.");
    else if (dateOfBirth && parsed.iso < dateOfBirth) errors.push("Admission date is before the date of birth.");
    else admissionDate = parsed.iso;
  }

  const phone = (field: StudentImportField, label: string) => {
    const result = normalizePhone(get(field));
    if (result.warning) warnings.push(`${label}: ${result.warning}.`);
    return result.value;
  };

  let bloodGroup = text("bloodGroup").toUpperCase().replace(/\s/g, "") || undefined;
  if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) {
    warnings.push(`Blood group "${bloodGroup}" isn't one of A+, A-, B+, B-, AB+, AB-, O+, O-.`);
    bloodGroup = undefined;
  }

  const guardians: ImportedGuardian[] = [];
  for (const n of [1, 2] as const) {
    const f = GUARDIAN_FIELDS[n];
    const first = text(f.first);
    const last = text(f.last);
    const phoneValue = phone(f.phone, `Guardian ${n} phone`);
    const emailValue = text(f.email).toLowerCase();
    const relationshipText = text(f.relationship);
    if (!first && !last && !phoneValue && !emailValue && !relationshipText) continue;

    if (!first || !last) {
      warnings.push(`Guardian ${n} was not saved because it needs both a first and a last name.`);
      continue;
    }
    if (phoneValue.length < 5) {
      warnings.push(`Guardian ${n} (${first} ${last}) was not saved because it needs a phone number.`);
      continue;
    }
    let relationshipType: ImportedGuardian["relationshipType"] = "GUARDIAN";
    if (relationshipText) {
      const parsed = parseRelationship(relationshipText);
      if (parsed) relationshipType = parsed;
      else {
        relationshipType = "OTHER";
        warnings.push(`Guardian ${n} relationship "${relationshipText}" isn't recognised, so it was saved as Other.`);
      }
    }
    let email: string | undefined = emailValue || undefined;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`Guardian ${n} email "${email}" isn't valid, so it was left out.`);
      email = undefined;
    }
    guardians.push({ firstName: first, lastName: last, relationshipType, phone: phoneValue, ...(email ? { email } : {}) });
  }

  const optional = (field: StudentImportField) => text(field) || undefined;
  const candidate = {
    rowNumber,
    firstName,
    lastName,
    otherNames: otherNames || undefined,
    gender: gender ?? undefined,
    dateOfBirth,
    admissionNumber: optional("admissionNumber"),
    admissionDate,
    className: optional("className"),
    houseName: optional("houseName"),
    nationality: optional("nationality"),
    residentialAddress: optional("residentialAddress"),
    city: optional("city"),
    region: optional("region"),
    bloodGroup,
    allergies: optional("allergies"),
    medicalConditions: optional("medicalConditions"),
    emergencyContactName: optional("emergencyContactName"),
    emergencyContactPhone: text("emergencyContactPhone") ? phone("emergencyContactPhone", "Emergency contact phone") : undefined,
    emergencyRelationship: optional("emergencyRelationship"),
    guardians,
  };

  if (errors.length) return { row: null, errors, warnings };
  const parsed = normalizedStudentRowSchema.safeParse(candidate);
  if (!parsed.success) {
    return { row: null, errors: [...new Set(parsed.error.issues.map((issue) => `${issue.path.join(".") || "Row"}: ${issue.message}`))], warnings };
  }
  return { row: parsed.data, errors, warnings };
}
