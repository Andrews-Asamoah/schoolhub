import { ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { payrollPaymentDetailsSchema, type PayrollPaymentDetailsInput } from "./payroll-inputs.js";

function key() {
  const configured = process.env.PAYROLL_DETAILS_ENCRYPTION_KEY ?? "";
  const bytes = Buffer.from(configured, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== configured) {
    throw new ServiceUnavailableException("Payroll details encryption is unavailable. Ask your system administrator to configure it.");
  }
  return bytes;
}
const context = (schoolId: string, kind: string, employeeId: string) =>
  Buffer.from(JSON.stringify(["payroll-payment-details-v1", schoolId, kind, employeeId]));

export function encryptPayrollDetails(schoolId: string, kind: string, employeeId: string, value: PayrollPaymentDetailsInput) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(context(schoolId, kind, employeeId));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptPayrollDetails(schoolId: string, kind: string, employeeId: string, sealed: string): PayrollPaymentDetailsInput {
  const bytes = key();
  try {
    const [version, nonce, tag, body] = sealed.split(".");
    if (version !== "v1" || !nonce || !tag || !body) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", bytes, Buffer.from(nonce, "base64url"), { authTagLength: 16 });
    cipher.setAAD(context(schoolId, kind, employeeId));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return payrollPaymentDetailsSchema.parse(JSON.parse(Buffer.concat([
      cipher.update(Buffer.from(body, "base64url")),
      cipher.final(),
    ]).toString("utf8")));
  } catch {
    throw new ServiceUnavailableException("Saved payment details could not be opened. Ask your system administrator to check the payroll encryption key.");
  }
}
