import type { BrandActivity } from "./brand-list";
import type { SignalEvent } from "./signals/model";

/**
 * A follow-up is a recorded outbound action shortly after a signal. It is a
 * timeline association, not proof that the signal caused the action.
 */
export const SIGNAL_FOLLOW_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type SignalFollowUp = {
  signal: SignalEvent;
  action: BrandActivity | null;
};

function activityTime(activity: BrandActivity) {
  const value = activity.recordedAt || activity.createdAt || activity.scheduledAt;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function eventTime(event: SignalEvent) {
  const value = event.detectedAt || event.occurredAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function signalFollowUps(input: {
  signals: SignalEvent[];
  outboundActivities: BrandActivity[];
  startAt?: string | null;
  endAt?: string | null;
}) {
  const start = input.startAt ? Date.parse(input.startAt) : Number.NEGATIVE_INFINITY;
  const end = input.endAt ? Date.parse(input.endAt) : Number.POSITIVE_INFINITY;
  const actions = input.outboundActivities
    .filter((activity) => {
      const time = activityTime(activity);
      return time !== null && time >= start && time < end;
    })
    .slice()
    .sort((left, right) => (activityTime(left) || 0) - (activityTime(right) || 0));

  return input.signals
    .filter((signal) => signal.isNewSignal !== false)
    .filter((signal) => {
      const time = eventTime(signal);
      return time !== null && time >= start && time < end;
    })
    .slice()
    .sort((left, right) => (eventTime(right) || 0) - (eventTime(left) || 0))
    .map((signal): SignalFollowUp => {
      const signalAt = eventTime(signal)!;
      const candidates = actions.filter((activity) => {
        const actionAt = activityTime(activity)!;
        return actionAt >= signalAt && actionAt <= signalAt + SIGNAL_FOLLOW_UP_WINDOW_MS;
      });
      // When the signal identifies a contact, never associate another
      // contact's work merely because it occurred in the same period.
      const sameContact = signal.contactId
        ? candidates.filter((activity) => activity.contactId === signal.contactId)
        : candidates;
      return { signal, action: sameContact[0] || null };
    });
}

export function signalFollowUpTime(activity: BrandActivity) {
  return activity.recordedAt || activity.createdAt || activity.scheduledAt || null;
}
