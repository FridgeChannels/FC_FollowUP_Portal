import { getWaProbeApiToken, getWaProbeBaseUrl } from "./config";
import {
  WaProbeError,
  isTerminalProbeStatus,
  probeHasWhatsapp,
  toProbeE164,
  type WaProbe,
} from "./helpers";

export {
  WaProbeError,
  mapWaProbeError,
  toProbeE164,
  probeHasWhatsapp,
  isTerminalProbeStatus,
} from "./helpers";
export type { WaProbe, WaProbeStatus } from "./helpers";

type ProbeEnqueueResponse = {
  ok?: boolean;
  queued?: boolean;
  reused?: boolean;
  retry_after_seconds?: number;
  digits?: string;
  probe?: WaProbe;
  detail?: {
    ok?: boolean;
    error?: string;
    retry_after_seconds?: number;
  };
};

type ProbeGetResponse = {
  ok?: boolean;
  probe?: WaProbe;
};

function assertToken() {
  const token = getWaProbeApiToken();
  if (!token) {
    throw new WaProbeError(
      "WA_PROBE_API_TOKEN / WA_API_TOKEN is not configured",
      "missing_token",
      503,
    );
  }
  return token;
}

async function waFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = assertToken();
  const base = getWaProbeBaseUrl();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload: T | { detail?: ProbeEnqueueResponse["detail"] | string; error?: string } = {} as T;
  try {
    payload = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new WaProbeError(
      `WA probe ${response.status}: ${text.slice(0, 200)}`,
      "bad_response",
      response.status,
    );
  }

  if (response.status === 401) {
    throw new WaProbeError("WhatsApp probe authentication failed", "unauthorized", 401);
  }
  if (response.status === 503) {
    throw new WaProbeError(
      "WhatsApp probe service token not configured on orch",
      "service_unavailable",
      503,
    );
  }
  if (response.status === 429) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail?: { retry_after_seconds?: number; error?: string } }).detail
        : undefined;
    const retry =
      typeof detail?.retry_after_seconds === "number"
        ? detail.retry_after_seconds
        : null;
    throw new WaProbeError(
      detail?.error || `WhatsApp probe interval; retry after ${retry ?? "?"}s`,
      "rate_limited",
      429,
      retry,
    );
  }
  if (response.status === 404) {
    throw new WaProbeError("WhatsApp probe not found", "not_found", 404);
  }
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: string }).error || "")
        : "") || `WhatsApp probe ${response.status}`;
    throw new WaProbeError(message, "http_error", response.status);
  }
  return payload as T;
}

export async function enqueueWaProbe(phone: string) {
  const e164 = toProbeE164(phone);
  if (!e164) {
    throw new WaProbeError("Invalid phone for WhatsApp probe", "invalid_phone", 400);
  }
  const payload = await waFetch<ProbeEnqueueResponse>("/wa/probe", {
    method: "POST",
    body: JSON.stringify({ phone: e164 }),
  });
  if (!payload.probe?.id) {
    throw new WaProbeError("WhatsApp probe returned no probe.id", "missing_id");
  }
  return payload;
}

export async function getWaProbeById(id: string) {
  const payload = await waFetch<ProbeGetResponse>(`/wa/probe/${encodeURIComponent(id)}`);
  if (!payload.probe) {
    throw new WaProbeError("WhatsApp probe result missing probe object", "missing_probe");
  }
  return payload.probe;
}

export async function getWaProbeByPhone(phone: string) {
  const e164 = toProbeE164(phone);
  if (!e164) {
    throw new WaProbeError("Invalid phone for WhatsApp probe", "invalid_phone", 400);
  }
  const payload = await waFetch<ProbeGetResponse>(
    `/wa/probe?phone=${encodeURIComponent(e164)}`,
  );
  if (!payload.probe) {
    throw new WaProbeError("WhatsApp probe result missing probe object", "missing_probe");
  }
  return payload.probe;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit probe and poll until terminal status.
 * Honors 429 once (waits retry_after, then retries enqueue).
 */
export async function probeWhatsappNumber(
  phone: string,
  options: { attempts?: number; delayMs?: number; maxRetryWaitMs?: number } = {},
) {
  const attempts = options.attempts ?? 20;
  const delayMs = options.delayMs ?? 3000;
  const maxRetryWaitMs = options.maxRetryWaitMs ?? 130_000;

  let enqueue: ProbeEnqueueResponse;
  try {
    enqueue = await enqueueWaProbe(phone);
  } catch (error) {
    if (error instanceof WaProbeError && error.status === 429) {
      const waitMs = Math.min(
        Math.max((error.retryAfterSeconds ?? 120) * 1000, 1000),
        maxRetryWaitMs,
      );
      await sleep(waitMs);
      enqueue = await enqueueWaProbe(phone);
    } else {
      throw error;
    }
  }

  let probe = enqueue.probe!;
  if (isTerminalProbeStatus(probe.status)) {
    return {
      phone: toProbeE164(phone)!,
      hasWhatsapp: probeHasWhatsapp(probe),
      status: probe.status,
      probe,
    };
  }

  for (let i = 0; i < attempts; i++) {
    await sleep(delayMs);
    probe = await getWaProbeById(probe.id);
    if (isTerminalProbeStatus(probe.status)) {
      return {
        phone: toProbeE164(phone)!,
        hasWhatsapp: probeHasWhatsapp(probe),
        status: probe.status,
        probe,
      };
    }
  }

  return {
    phone: toProbeE164(phone)!,
    hasWhatsapp: null as boolean | null,
    status: probe.status || "pending",
    probe,
    timedOut: true as const,
  };
}
