"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CPCode, Interaction } from "./outreach-domain";

export const CALL_REVIEW_MANAGER_EMAIL = "peter@fridgeteam.com";
export const CALL_REVIEW_CALLER_EMAIL = "beril@fridgechannels.com";
export const CALL_REVIEW_DEMO_BRAND_ID = "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87";
export const CALL_REVIEW_DEMO_BRAND_NAME = "Test FridgeChannel Peter";
export const CALL_REVIEW_DEMO_TASK_ID = "3db9166f-d9fd-8119-aa29-f4273e978af2";
export const CALL_REVIEW_DEMO_INTERACTION_ID = "demo-peter-beril-phone-review";

export function isCallReviewManager(email?: string | null) {
  return [CALL_REVIEW_MANAGER_EMAIL, "peter@fridgechannels.com"].includes(email?.trim().toLowerCase() || "");
}

export type CallReviewStatus = "Qualified" | "Unqualified";

export type CallReviewMetadata = {
  interactionId: string;
  taskId: string | null;
  status: CallReviewStatus;
  reviewedAt: string;
  reviewedBy: string;
  assignedCaller: string;
  recallRequested: boolean;
};

export function taskStatusForCallReview(status: string, review?: CallReviewMetadata) {
  if (review?.status === "Qualified") return "Completed";
  if (review?.status === "Unqualified") return "Pending";
  return status;
}

const STORAGE_KEY = "fc-call-review-metadata-v1";
const EVENT_NAME = "fc-call-review-metadata-change";

function readMetadata(): Record<string, CallReviewMetadata> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, CallReviewMetadata>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function useCallReviewMetadata() {
  const [reviews, setReviews] = useState<Record<string, CallReviewMetadata>>({});

  useEffect(() => {
    const sync = () => setReviews(readMetadata());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const reviewCall = useCallback((input: { interactionId: string; taskId?: string; status: CallReviewStatus }) => {
    const next = {
      ...readMetadata(),
      [input.interactionId]: {
        interactionId: input.interactionId,
        taskId: input.taskId || null,
        status: input.status,
        reviewedAt: new Date().toISOString(),
        reviewedBy: CALL_REVIEW_MANAGER_EMAIL,
        assignedCaller: CALL_REVIEW_CALLER_EMAIL,
        recallRequested: input.status === "Unqualified",
      },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setReviews(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const reviewsByTask = useMemo(() => Object.values(reviews).reduce<Record<string, CallReviewMetadata>>((result, review) => {
    if (review.taskId) result[review.taskId] = review;
    return result;
  }, {}), [reviews]);

  return { reviews, reviewsByTask, reviewCall };
}

export function demoPhoneInteraction(input: { customerId: string; contactId?: string; cp: CPCode }): Interaction {
  return {
    id: CALL_REVIEW_DEMO_INTERACTION_ID,
    customerId: input.customerId,
    contactId: input.contactId,
    taskId: CALL_REVIEW_DEMO_TASK_ID,
    cp: input.cp,
    type: "Phone",
    channel: "Phone",
    direction: "Outbound",
    title: "Phone · Connected",
    content: "Connected with the KeyPerson and reviewed the sample handoff.",
    createdAt: "2026-09-15T06:20:00.000Z",
    callResult: "Connected",
    quo: {
      callId: "ACdemo-peter-beril",
      call: {
        id: "ACdemo-peter-beril",
        status: "completed",
        direction: "outgoing",
        from: "+1 646 555 0100",
        to: "+1 917 555 0188",
        createdAt: "2026-09-15T06:16:42.000Z",
        answeredAt: "2026-09-15T06:16:49.000Z",
        completedAt: "2026-09-15T06:20:00.000Z",
        duration: 191,
      },
      transcript: {
        callId: "ACdemo-peter-beril",
        status: "completed",
        duration: 191,
        dialogue: [
          { identifier: "Beril", content: "I’m following up to confirm the sample reached the right person." },
          { identifier: "KeyPerson", content: "Yes, the sample arrived and I have shared it with our team." },
        ],
      },
      summary: {
        callId: "ACdemo-peter-beril",
        status: "completed",
        summary: ["The sample was received and shared internally.", "The contact is open to a follow-up conversation."],
        nextSteps: ["Account Manager reviews the call and decides whether it is qualified."],
      },
      eventTypes: ["call.completed", "call.transcript.completed", "call.summary.completed"],
      lastEventAt: "2026-09-15T06:20:10.000Z",
    },
  };
}
