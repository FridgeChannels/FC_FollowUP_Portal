declare global {
  interface ImportMetaEnv {
    readonly SKIP_UNAVAILABLE_CHANNELS?: string;
  }
}

export type ChannelEndpointContact = {
  email?: string | null;
  emailValid?: boolean;
  phone?: string | null;
  phoneValid?: boolean;
  /** KeyPersonDB "WhatsApp Number" — presence means WhatsApp is reachable. */
  whatsapp?: string | null;
  linkedin?: string | null;
};

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

export function endpointForChannel(contact: ChannelEndpointContact, channel: string) {
  if (channel === "Email") return (contact.email || "").trim();
  if (channel === "LinkedIn") return (contact.linkedin || "").trim();
  if (channel === "WhatsApp") return (contact.whatsapp || "").trim();
  if (channel === "SMS" || channel === "Phone") return (contact.phone || "").trim();
  return "";
}

/** WhatsApp is available only when KeyPerson "WhatsApp Number" is set — not Phone. */
export function channelReachable(contact: ChannelEndpointContact, channel: string) {
  const endpoint = endpointForChannel(contact, channel);
  if (channel === "Email") return !!endpoint && !!contact.emailValid;
  if (channel === "LinkedIn") return !!endpoint;
  if (channel === "WhatsApp") return !!endpoint;
  if (channel === "SMS" || channel === "Phone") return !!endpoint && !!contact.phoneValid;
  return false;
}

export const channelAvailable = channelReachable;

export function unavailableChannelMessage(channel: string) {
  if (channel === "WhatsApp") {
    return "WhatsApp is unavailable for this KeyPerson (WhatsApp Number is empty)";
  }
  return `${channel} is unavailable for this KeyPerson`;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeLinkedin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return (match?.[1] || trimmed).toLowerCase();
}

export function contactMatchesChannelSender(
  contact: ChannelEndpointContact,
  channel: string,
  sender: string,
) {
  const value = sender.trim();
  if (!value) return false;
  const endpoint = endpointForChannel(contact, channel);
  if (!endpoint) return false;
  if (channel === "Email") {
    return endpoint.toLowerCase() === value.toLowerCase();
  }
  if (channel === "LinkedIn") {
    return normalizeLinkedin(endpoint) === normalizeLinkedin(value);
  }
  const left = normalizePhone(endpoint);
  const right = normalizePhone(value);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}
