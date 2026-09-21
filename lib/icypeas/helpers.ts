export const ICYPEAS_CREDITS_EXHAUSTED_MESSAGE =
  "工具积分已用尽，请联系 Mark 充值";

export class IcypeasError extends Error {
  readonly code: string;
  readonly creditsExhausted: boolean;

  constructor(message: string, code = "icypeas_error", creditsExhausted = false) {
    super(message);
    this.name = "IcypeasError";
    this.code = code;
    this.creditsExhausted = creditsExhausted;
  }
}

export function pickBestEmail(
  emails: Array<{ email?: string; certainty?: string }> | undefined,
) {
  if (!emails?.length) return null;
  const ranked = [...emails].sort((a, b) => {
    const order = (c?: string) =>
      c === "ultra_sure" ? 0 : c === "sure" ? 1 : c === "probable" ? 2 : 3;
    return order(a.certainty) - order(b.certainty);
  });
  const email = ranked[0]?.email?.trim();
  return email || null;
}

export function mapIcypeasError(error: unknown) {
  if (error instanceof IcypeasError) {
    return {
      message: error.message,
      code: error.code,
      creditsExhausted: error.creditsExhausted,
    };
  }
  const message = error instanceof Error ? error.message : "Icypeas request failed";
  if (/insufficient|credits|unpaid/i.test(message)) {
    return {
      message: ICYPEAS_CREDITS_EXHAUSTED_MESSAGE,
      code: "insufficient_credits",
      creditsExhausted: true,
    };
  }
  return { message, code: "icypeas_error", creditsExhausted: false };
}
