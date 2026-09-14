export class ExtendedParametersError extends Error {}

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
