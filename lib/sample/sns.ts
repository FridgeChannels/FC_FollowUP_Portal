/** Split ClientDB "NFC Card SN" into ordered unique serials (`SN1, SN2`). */
export function parseNfcCardSns(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const sns: string[] = [];
  for (const part of raw.split(",")) {
    const sn = part.trim();
    if (!sn || seen.has(sn)) continue;
    seen.add(sn);
    sns.push(sn);
  }
  return sns;
}

export function pickSelectedSn(
  sns: string[],
  requested: string | null | undefined,
): string | null {
  if (!sns.length) return null;
  const want = (requested || "").trim();
  if (want && sns.includes(want)) return want;
  return sns[0];
}
