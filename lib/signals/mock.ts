import { summarize, type SignalBrand, type SignalsPayload } from "./model.ts";

/** The stable demo brand used by `/signals?mock=1`. */
export const MOCK_SIGNAL_BRAND_ID = "3dc9166f-d9fd-8095-991c-d2bbb00ad58e";
/** The Peter test brand used to preview email signal presentation. */
export const MOCK_PETER_SIGNAL_BRAND_ID = "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87";

function at(now: Date, offsetMinutes: number) {
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString();
}

/**
 * A complete mock signal set for Test FridgeChannel Atlas. The brand's real
 * profile and communication history are read for context, while mock actions
 * remain local to this preview and never write to providers.
 */
export function mockSignals(now = new Date()): SignalsPayload {
  const brands: SignalBrand[] = [
    {
      id: MOCK_PETER_SIGNAL_BRAND_ID,
      name: "Test FridgeChannel Peter",
      ownerName: "Peter",
      currentCp: "CP2 · Sample Delivered to Owner",
      unread: true,
      needsReview: true,
      status: "Needs Review",
      events: [
        {
          id: "mock-test-peter-email-open-2",
          brandId: MOCK_PETER_SIGNAL_BRAND_ID,
          type: "email",
          conversationId: "mock-test-peter-email-thread",
          messageId: "mock-test-peter-email-message",
          summary: "Opened the sample follow-up email twice — a strong buying signal.",
          occurredAt: at(now, -14),
          detectedAt: at(now, -10),
          subject: "Quick check on the FridgeChannel sample",
          sourceUrl: "https://mail.google.com/",
          evidence: "The recipient opened the sample follow-up again after delivery.",
          highPriority: true,
        },
        {
          id: "mock-test-peter-email-open-1",
          brandId: MOCK_PETER_SIGNAL_BRAND_ID,
          type: "email",
          conversationId: "mock-test-peter-email-thread",
          messageId: "mock-test-peter-email-message",
          summary: "Opened the sample follow-up email twice — a strong buying signal.",
          occurredAt: at(now, -32),
          detectedAt: at(now, -29),
          subject: "Quick check on the FridgeChannel sample",
          sourceUrl: "https://mail.google.com/",
          evidence: "First open detected from the sample follow-up message.",
          highPriority: true,
        },
      ],
    },
    {
      id: MOCK_SIGNAL_BRAND_ID,
      name: "Test FridgeChannel Atlas",
      ownerName: "Peter",
      currentCp: "CP2 · Sample Delivered to Owner",
      unread: true,
      needsReview: true,
      status: "Needs Review",
      events: [
        {
          id: "mock-test-atlas-linkedin",
          brandId: MOCK_SIGNAL_BRAND_ID,
          type: "linkedin",
          summary: "Posted about expanding the retail product line — timely opening for follow-up.",
          occurredAt: at(now, -18),
          detectedAt: at(now, -12),
          publishedAt: at(now, -25),
          sourceUrl: "https://www.linkedin.com/",
          evidence: "Post mentions a new retail partner and product expansion.",
          highPriority: true,
        },
        {
          id: "mock-test-atlas-email",
          brandId: MOCK_SIGNAL_BRAND_ID,
          type: "email",
          conversationId: "mock-test-atlas-email-thread",
          messageId: "mock-test-atlas-email-message",
          summary: "Opened the sample follow-up email twice — a strong buying signal.",
          occurredAt: at(now, -48),
          detectedAt: at(now, -46),
          subject: "Your FridgeChannel sample follow-up",
          sourceUrl: "https://mail.google.com/",
          evidence: "Opened after the sample delivery follow-up was sent.",
          highPriority: true,
        },
        {
          id: "mock-test-atlas-email-open-1",
          brandId: MOCK_SIGNAL_BRAND_ID,
          type: "email",
          conversationId: "mock-test-atlas-email-thread",
          messageId: "mock-test-atlas-email-message",
          summary: "Opened the sample follow-up email twice — a strong buying signal.",
          occurredAt: at(now, -66),
          detectedAt: at(now, -64),
          subject: "Your FridgeChannel sample follow-up",
          sourceUrl: "https://mail.google.com/",
          evidence: "Second open detected from the same message thread.",
          highPriority: true,
        },
        {
          id: "mock-test-atlas-tap-2",
          brandId: MOCK_SIGNAL_BRAND_ID,
          type: "sample",
          sampleId: "FC-ATLAS-2026",
          summary: "Second sample tap in the last two hours.",
          occurredAt: at(now, -95),
          detectedAt: at(now, -95),
          evidence: "Tapped from the Test FridgeChannel Atlas sample.",
          highPriority: true,
        },
        {
          id: "mock-test-atlas-tap-1",
          brandId: MOCK_SIGNAL_BRAND_ID,
          type: "sample",
          sampleId: "FC-ATLAS-2026",
          summary: "Sample tap detected after delivery.",
          occurredAt: at(now, -165),
          detectedAt: at(now, -165),
          evidence: "Tapped from the Test FridgeChannel Atlas sample.",
          highPriority: false,
        },
      ],
    },
  ];

  return {
    readOnly: true,
    brands,
    sources: {
      sample: "Not connected",
      email: "Not connected",
      linkedin: "Not connected",
    },
    summary: summarize(brands, now),
  };
}
