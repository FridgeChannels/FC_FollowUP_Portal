export type QuoMedia = {
  url?: string | null;
  type?: string | null;
  duration?: number | null;
  [key: string]: unknown;
};

export type QuoCall = {
  id?: string | null;
  object?: string | null;
  from?: string | null;
  to?: string | null;
  direction?: string | null;
  media?: QuoMedia[] | null;
  recordings?: QuoRecording[] | null;
  voicemail?: QuoVoicemail | null;
  status?: string | null;
  createdAt?: string | null;
  answeredAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  userId?: string | null;
  phoneNumberId?: string | null;
  conversationId?: string | null;
  answeredBy?: string | null;
  initiatedBy?: string | null;
  callRoute?: string | null;
  duration?: number | null;
  forwardedFrom?: string | null;
  forwardedTo?: string | null;
  aiHandled?: string | null;
  participants?: string[] | null;
  contactIds?: string[] | null;
  [key: string]: unknown;
};

export type QuoRecording = {
  id?: string | null;
  duration?: number | null;
  startTime?: string | null;
  status?: string | null;
  type?: string | null;
  url?: string | null;
  [key: string]: unknown;
};

export type QuoTranscriptLine = {
  content?: string | null;
  start?: number | null;
  end?: number | null;
  identifier?: string | null;
  userId?: string | null;
  [key: string]: unknown;
};

export type QuoTranscript = {
  object?: string | null;
  callId?: string | null;
  createdAt?: string | null;
  language?: string | null;
  dialogue?: QuoTranscriptLine[] | null;
  duration?: number | null;
  status?: string | null;
  contactIds?: string[] | null;
  [key: string]: unknown;
};

export type QuoJob = {
  icon?: string | null;
  name?: string | null;
  result?: { data?: Array<{ name?: string | null; value?: string | null; [key: string]: unknown }> | null; [key: string]: unknown } | null;
  [key: string]: unknown;
};

export type QuoSummary = {
  object?: string | null;
  callId?: string | null;
  status?: string | null;
  summary?: string[] | null;
  nextSteps?: string[] | null;
  jobs?: QuoJob[] | null;
  contactIds?: string[] | null;
  [key: string]: unknown;
};

export type QuoVoicemail = {
  id?: string | null;
  duration?: number | null;
  transcript?: string | null;
  recordingUrl?: string | null;
  url?: string | null;
  type?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type QuoWebhookEvent = {
  id?: string | null;
  object?: string | null;
  apiVersion?: string | null;
  createdAt?: string | null;
  type?: string | null;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type QuoCallData = {
  callId: string;
  call?: QuoCall | null;
  recordings?: QuoRecording[];
  transcript?: QuoTranscript | null;
  summary?: QuoSummary | null;
  voicemail?: QuoVoicemail | null;
  webhookEvents?: QuoWebhookEvent[];
  eventTypes?: string[];
  lastEventAt?: string | null;
};

export type QuoApiEnvelope<T> = { data: T };
