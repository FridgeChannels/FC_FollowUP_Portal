export class ExtendedParametersError extends Error {}

export function parseExtendedParametersObject(value?: string | null): Record<string, unknown> | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function asExtendedParameters(value?: unknown) {
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ExtendedParametersError("extendedParameters must be valid JSON");
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ExtendedParametersError("extendedParameters must be a JSON object");
  }
  const encoded = JSON.stringify(value);
  if (encoded === "{}") return null;
  return encoded;
}

/**
 * Extended Parameters are inherited from earlier messages in the thread, so a previous
 * "no quote" choice must be cleared before this message records its own.
 */
export function withQuoteHistory(inherited: string | null | undefined, quoteHistory: boolean | undefined) {
  const base = parseExtendedParametersObject(inherited);
  if (!base) {
    return quoteHistory === false ? asExtendedParameters({ quoteHistory: false }) : inherited ?? null;
  }
  if (!("quoteHistory" in base) && quoteHistory !== false) return inherited ?? null;
  const rest = { ...base };
  delete rest.quoteHistory;
  return asExtendedParameters(quoteHistory === false ? { ...rest, quoteHistory: false } : rest);
}

/**
 * Marks an SMS/WhatsApp outbound as dependent on an email Task.
 * Orchestrator skips until that task is Completed, and cancels if it Failed.
 */
export function withAfterEmailFollowUp(
  inherited: string | null | undefined,
  followUp: { afterTaskId: string; offsetMinutes: number } | null | undefined,
) {
  const base = parseExtendedParametersObject(inherited) || {};
  const rest = { ...base };
  delete rest.afterTaskId;
  delete rest.offsetMinutes;
  const afterTaskId = followUp?.afterTaskId?.trim();
  if (!afterTaskId) {
    return asExtendedParameters(rest) ?? (Object.keys(rest).length ? inherited ?? null : null);
  }
  const offsetMinutes = Number(followUp?.offsetMinutes);
  return asExtendedParameters({
    ...rest,
    afterTaskId,
    offsetMinutes: Number.isFinite(offsetMinutes) ? Math.max(0, Math.floor(offsetMinutes)) : 0,
  });
}
