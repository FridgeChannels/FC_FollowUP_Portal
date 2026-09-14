declare global {
  interface ImportMetaEnv {
    readonly DEV_CALL_PHONE?: string;
  }
}

export function parseDevCallPhone(raw?: string | null) {
  const value = (raw || "").trim();
  return value || null;
}

export function devCallPhoneOnClient() {
  return parseDevCallPhone(import.meta.env.DEV_CALL_PHONE);
}
