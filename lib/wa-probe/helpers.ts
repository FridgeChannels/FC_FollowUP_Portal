import { formatStandardPhone } from "../phone-format.ts";

export type WaProbeStatus = "pending" | "yes" | "no" | "unknown" | "error" | string;

export type WaProbe = {
  id: string;
  phone: string;
  status: WaProbeStatus;
  has_whatsapp: boolean | null;
  job_id?: string | null;
  detail?: string | null;
  updated_at?: string;
};

export class WaProbeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code = "wa_probe_error",
    status = 500,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "WaProbeError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function mapWaProbeError(error: unknown) {
  if (error instanceof WaProbeError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  const message = error instanceof Error ? error.message : "WhatsApp probe failed";
  return { message, code: "wa_probe_error", status: 500, retryAfterSeconds: null as number | null };
}

/** E.164 for probe API — mobile only, no extension. */
export function toProbeE164(raw?: string | null): string | null {
  const formatted = formatStandardPhone(raw);
  if (!formatted || formatted.hasExtension) return null;
  return `+${formatted.e164Digits}`;
}

export function isTerminalProbeStatus(status: WaProbeStatus) {
  return status !== "pending";
}

export function probeHasWhatsapp(probe: Pick<WaProbe, "status" | "has_whatsapp">) {
  if (probe.has_whatsapp === true || probe.status === "yes") return true;
  if (probe.has_whatsapp === false || probe.status === "no") return false;
  return null;
}
