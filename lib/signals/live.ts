import { canViewBrand, type BrandViewer } from "../brand-access";
import { prewarmBrandProjection } from "../notion/followup-clients";
import { supabaseSelect } from "../supabase/client";
import { isSupabaseConfigured } from "../supabase/config";
import { signalBrands } from "./brands";
import { signalsWritesEnabled } from "./config";
import { aggregateSignals, loadSignalEvents } from "./data";
import { summarize, type SignalsPayload } from "./model";

function logSignalsPhase(
  phase: string,
  startedAt: number,
  details: Record<string, unknown> = {},
) {
  console.info("[signals] phase", {
    phase,
    durationMs: Date.now() - startedAt,
    ...details,
  });
}

/**
 * Build the Signals payload for one viewer.
 *
 * Single source of truth for the payload shape. Callers are expected to wrap
 * this in `runWithNotionLimit(...)` — it fans out to Notion for brand metadata.
 */
export async function computeSignals(viewer: BrandViewer): Promise<SignalsPayload> {
  if (!isSupabaseConfigured()) {
    return {
      readOnly: true,
      brands: [],
      sources: {
        sample: "Not connected",
        email: "Not connected",
        linkedin: "Not connected",
      },
      summary: summarize([]),
    };
  }

  const startedAt = Date.now();
  // The Notion lookups the projection needs are warmed while Supabase streams
  // the events, so their latency overlaps instead of stacking after the fan-out.
  const [signals] = await Promise.all([
    loadSignalEvents(),
    prewarmBrandProjection().catch(() => undefined),
  ]);
  const { events, notifications } = signals;
  logSignalsPhase("events", startedAt, { events: events.length });

  const brandsStartedAt = Date.now();
  const candidates = await signalBrands([...new Set(events.map((e) => e.brandId))]);
  logSignalsPhase("brands", brandsStartedAt, {
    requested: new Set(events.map((e) => e.brandId)).size,
    resolved: candidates.length,
  });

  // Re-evaluate viewer access on every response, including cached CRM projections.
  const brands = candidates
    .filter((brand) => canViewBrand(viewer, brand))
    .map((brand) =>
      aggregateSignals(brand, events, notifications, viewer.ownerId || viewer.email),
    );

  logSignalsPhase("total", startedAt, { brands: brands.length });
  return {
    readOnly: !signalsWritesEnabled(),
    brands,
    sources: {
      sample: "Connected",
      email: events.some((e) => e.type === "email") ? "Connected" : "Not connected",
      linkedin: events.some((e) => e.type === "linkedin") ? "Connected" : "Not connected",
    },
    summary: summarize(brands),
  };
}

/**
 * Cheap change token for the whole signals feed.
 *
 * One scalar lookup per table (`limit=1`, index-ordered) — no Notion calls, no
 * row payloads. Any ingest or sync run moves at least one of these timestamps,
 * so an unchanged token means "nothing to re-render".
 *
 * NOTE: `id` columns are UUIDs, so they carry no ordering — always probe the
 * timestamp columns instead.
 */
export async function readSignalsVersion(): Promise<string> {
  if (!isSupabaseConfigured()) return "unconfigured";
  const [visits, cursors, notifications, reads] = await Promise.all([
    supabaseSelect<{ synced_at: string | null }>("sample_tap_visits", {
      select: "synced_at",
      order: "synced_at.desc",
      limit: 1,
    }),
    supabaseSelect<{ last_run_at: string | null }>("sample_sync_cursors", {
      select: "last_run_at",
      order: "last_run_at.desc.nullslast",
      limit: 1,
    }),
    supabaseSelect<{ created_at: string | null }>("system_notifications", {
      select: "created_at",
      order: "created_at.desc",
      limit: 1,
    }),
    // Read/review snapshots are upserted in place, so `created_at` never moves
    // when an AM reads a signal — `read_at` is the column that does. Without it
    // a read made in another tab or device stays invisible to the probe.
    supabaseSelect<{ read_at: string | null }>("system_notifications", {
      select: "read_at",
      order: "read_at.desc.nullslast",
      limit: 1,
    }),
  ]);
  return [
    visits[0]?.synced_at || "",
    cursors[0]?.last_run_at || "",
    notifications[0]?.created_at || "",
    reads[0]?.read_at || "",
  ].join("|");
}
