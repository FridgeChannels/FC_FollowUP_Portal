declare global {
  interface ImportMetaEnv {
    readonly SKIP_UNAVAILABLE_CHANNELS?: string;
  }
}

export function parseSkipUnavailableChannels(
  raw?: string | null,
  productionFallback = false,
) {
  if (raw != null && raw.trim() !== "") {
    return /^(1|true|yes|on)$/i.test(raw.trim());
  }
  return productionFallback;
}

export function skipUnavailableChannelsOnClient() {
  return parseSkipUnavailableChannels(
    import.meta.env.SKIP_UNAVAILABLE_CHANNELS,
    import.meta.env.PROD,
  );
}
