/** Same Mark recharge copy as Icypeas — both tools share ops ownership. */
export const FULLENRICH_CREDITS_EXHAUSTED_MESSAGE =
  "工具积分已用尽，请联系 Mark 充值";

export class FullenrichError extends Error {
  readonly code: string;
  readonly creditsExhausted: boolean;

  constructor(message: string, code = "fullenrich_error", creditsExhausted = false) {
    super(message);
    this.name = "FullenrichError";
    this.code = code;
    this.creditsExhausted = creditsExhausted;
  }
}

export function mapFullenrichError(error: unknown) {
  if (error instanceof FullenrichError) {
    return {
      message: error.message,
      code: error.code,
      creditsExhausted: error.creditsExhausted,
    };
  }
  const message = error instanceof Error ? error.message : "FullEnrich request failed";
  if (/insufficient|credits|credit/i.test(message)) {
    return {
      message: FULLENRICH_CREDITS_EXHAUSTED_MESSAGE,
      code: "insufficient_credits",
      creditsExhausted: true,
    };
  }
  return { message, code: "fullenrich_error", creditsExhausted: false };
}

export function domainFromEmail(email?: string | null) {
  const value = email?.trim().toLowerCase() || "";
  const at = value.lastIndexOf("@");
  if (at < 0) return "";
  return value.slice(at + 1).trim();
}

export {
  classifyFullenrichPhones,
  classifyRawPhone,
  formatStandardPhone,
  type ClassifiedPhones,
} from "../phone-format.ts";

import { classifyFullenrichPhones } from "../phone-format.ts";

type PhoneCandidate = {
  number?: string;
  line_type?: string;
  line_status?: string;
};

/** @deprecated prefer classifyFullenrichPhones — kept for tests that only need one mobile */
export function pickBestPhone(input: {
  mostProbable?: PhoneCandidate | null;
  phones?: PhoneCandidate[] | null;
}) {
  const classified = classifyFullenrichPhones(input);
  return classified.phone || classified.directPhone || classified.officePhone;
}
