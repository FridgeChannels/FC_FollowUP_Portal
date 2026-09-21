import assert from "node:assert/strict";
import { test } from "node:test";
import { easternDateOnly, easternDateTimeIso, parseScheduledAt } from "./calendar.ts";
import { commitSchedule, previewSchedule } from "./index.ts";
import type {
  Channel,
  ChannelSelection,
  ClientSelection,
  ContactFollowUpStatus,
  CreationMethod,
  ExistingTask,
  Priority,
  ScheduleInput,
  ScheduleSnapshot,
} from "./types.ts";

const OPEN_CAPACITY: ScheduleSnapshot = {
  dailyMax: { Email: 10, LinkedIn: 10, SMS: 10, WhatsApp: 10, Phone: 10 },
  timeInterval: { Email: 5, LinkedIn: 5, SMS: 5, WhatsApp: 5, Phone: 5 },
  existingTasks: [],
};

/** Before the ET work window so first same-day slot is 09:00. */
const BEFORE_WINDOW = "T08:00:00-04:00";

function channel(name: Channel, extra: Partial<ChannelSelection> = {}): ChannelSelection {
  return { channel: name, reachable: true, ...extra };
}

function client(overrides: Partial<ClientSelection> & Pick<ClientSelection, "clientId">): ClientSelection {
  return {
    ownerId: overrides.ownerId ?? "owner-1",
    followUpStatus: overrides.followUpStatus ?? "In Progress",
    clientPriority: overrides.clientPriority,
    contacts: overrides.contacts ?? [{
      contactId: "ct-1",
      followUpStatus: "Not Contacted",
      channels: [channel("Email")],
    }],
    ...overrides,
  };
}

function input(options: {
  start?: string;
  latest?: string;
  horizon?: number;
  method?: CreationMethod;
  now?: string;
  testMode?: boolean;
  clients: ClientSelection[];
  snapshot?: ScheduleSnapshot;
}): ScheduleInput {
  const start = options.start ?? "2026-09-14";
  return {
    request: {
      preferredStartDate: start,
      latestDate: options.latest,
      maxHorizonDays: options.horizon,
      now: options.now ?? `${start}${BEFORE_WINDOW}`,
      testMode: options.testMode,
      creationMethod: options.method ?? "Manual",
      clients: options.clients,
    },
    snapshot: options.snapshot ?? OPEN_CAPACITY,
  };
}

function etDate(scheduledAt: string | undefined): string | undefined {
  return scheduledAt ? parseScheduledAt(scheduledAt).dateOnly : undefined;
}

function etMinute(scheduledAt: string | undefined): number | undefined {
  return scheduledAt ? parseScheduledAt(scheduledAt).minuteOfDay : undefined;
}

test("Manual 任务自动设为 P0", () => {
  const plan = previewSchedule(input({
    method: "Manual",
    clients: [client({
      clientId: "c1",
      contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Email")] }],
    })],
  }));
  assert.equal(plan.scheduled[0]?.priority, "P0");
  assert.equal(plan.scheduled[0]?.creationMethod, "Manual");
});

test("Automated 按联系人状态写入 P1 或 P2，且不会出现 P0", () => {
  const plan = previewSchedule(input({
    method: "Automated",
    clients: [
      client({
        clientId: "c-progress",
        contacts: [{ contactId: "ct-p", followUpStatus: "In Progress", channels: [channel("Email")] }],
      }),
      client({
        clientId: "c-new",
        contacts: [{ contactId: "ct-n", followUpStatus: "Not Contacted", channels: [channel("SMS")] }],
      }),
    ],
  }));
  const priorities = Object.fromEntries(plan.scheduled.map(task => [task.clientId, task.priority]));
  assert.equal(priorities["c-progress"], "P1");
  assert.equal(priorities["c-new"], "P2");
  assert.equal(plan.scheduled.some(task => task.priority === "P0"), false);
});

test("未选择联系人时客户进入 Needs Review，不写任务", () => {
  const plan = previewSchedule(input({
    clients: [client({ clientId: "c1", contacts: [] })],
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.needsReview[0]?.code, "NO_CONTACTS_SELECTED");
  assert.equal(plan.needsReview[0]?.scope, "client");
});

test("未选择渠道时联系人进入 Needs Review", () => {
  const plan = previewSchedule(input({
    clients: [client({
      clientId: "c1",
      contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [] }],
    })],
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.needsReview[0]?.code, "NO_CHANNELS_SELECTED");
});

for (const status of ["Completed", "Terminated"] as const) {
  test(`联系人状态 ${status} 进入 Needs Review`, () => {
    const plan = previewSchedule(input({
      clients: [client({
        clientId: "c1",
        contacts: [{ contactId: "ct-1", followUpStatus: status as ContactFollowUpStatus, channels: [channel("Email")] }],
      })],
    }));
    assert.equal(plan.scheduled.length, 0);
    assert.equal(plan.needsReview[0]?.code, "CONTACT_STATUS_BLOCKED");
  });
}

test("客户 Completed 时整户进入 Needs Review", () => {
  const plan = previewSchedule(input({
    clients: [client({ clientId: "c1", followUpStatus: "Completed" })],
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.needsReview[0]?.code, "CLIENT_STATUS_BLOCKED");
});

test("缺少 Owner 进入 Needs Review", () => {
  const plan = previewSchedule(input({
    clients: [client({ clientId: "c1", ownerId: "   " })],
  }));
  assert.equal(plan.needsReview[0]?.code, "MISSING_OWNER");
  assert.equal(plan.scheduled.length, 0);
});

test("任一选中渠道不可用时，整位联系人进入复核且不写任何任务", () => {
  const plan = previewSchedule(input({
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: [channel("Email"), channel("WhatsApp", { reachable: false })],
      }],
    })],
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.unscheduled.length, 0);
  assert.equal(plan.needsReview[0]?.code, "CHANNEL_UNREACHABLE");
  assert.deepEqual(plan.needsReview[0]?.channels, ["WhatsApp"]);
});

test("存在禁联规则时整位联系人进入复核", () => {
  const plan = previewSchedule(input({
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "In Progress",
        channels: [channel("Email", { doNotContact: true }), channel("Phone")],
      }],
    })],
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.needsReview[0]?.code, "DO_NOT_CONTACT");
});

test("联系人已转 Manual 时，自动创建进入复核", () => {
  const plan = previewSchedule(input({
    method: "Automated",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "In Progress",
        followUpMode: "Manual",
        channels: [channel("Email")],
      }],
    })],
  }));
  assert.equal(plan.needsReview[0]?.code, "CONTACT_MODE_BLOCKS_AUTOMATED");
  assert.equal(plan.scheduled.length, 0);
});

test("Preferred Start Date 落在周末时，从下一个工作日起排，且为 09:00 ET", () => {
  const plan = previewSchedule(input({
    start: "2026-09-12",
    now: "2026-09-12T08:00:00-04:00",
    clients: [client({ clientId: "c1" })],
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-14");
  assert.equal(plan.scheduled[0]?.scheduledAt, easternDateTimeIso("2026-09-14", 9 * 60));
});

test("渠道当日容量用尽后顺延到下一个工作日", () => {
  const existing: ExistingTask[] = [
    { clientId: "other", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" },
  ];
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({ clientId: "c1" })],
    snapshot: {
      dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      existingTasks: existing,
    },
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-15");
});

test("Cancelled 任务不占用容量", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({ clientId: "c1" })],
    snapshot: {
      dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      existingTasks: [{ clientId: "other", channel: "Email", scheduledAt: "2026-09-14", status: "Cancelled" }],
    },
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-14");
});

test("Pending / In Progress / Completed / Failed 都占用容量", () => {
  const occupying = ["Pending", "In Progress", "Completed", "Failed"] as const;
  const existing: ExistingTask[] = occupying.map((status, index) => ({
    clientId: `other-${index}`,
    channel: "Email" as const,
    scheduledAt: "2026-09-14",
    status,
  }));
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({ clientId: "c1" })],
    snapshot: { dailyMax: { Email: 4, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: existing },
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-15");
});

test("Daily Max 为 0 时该渠道任务 Unscheduled", () => {
  const plan = previewSchedule(input({
    clients: [client({ clientId: "c1" })],
    snapshot: { dailyMax: { Email: 0, LinkedIn: 10, SMS: 10, WhatsApp: 10, Phone: 10 }, existingTasks: [] },
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.unscheduled[0]?.code, "CHANNEL_PAUSED");
});

test("OmniReach：同一客户每天只排 1 个渠道，5 个渠道至少跨 5 个工作日", () => {
  const channels: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Automated",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: channels.map(name => channel(name)),
      }],
    })],
  }));
  const dates = plan.scheduled.map(task => etDate(task.scheduledAt));
  assert.deepEqual(dates, ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
  assert.equal(new Set(dates).size, 5);
});

test("人工 Send：忽略客户每日一渠，多渠道可同日落在渠道容量内（Phone 除外固定第 5 工作日）", () => {
  const channels: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Manual",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: channels.map(name => channel(name)),
      }],
    })],
  }));
  assert.equal(plan.scheduled.length, 5);
  const byChannel = Object.fromEntries(plan.scheduled.map(task => [task.channel, etDate(task.scheduledAt)]));
  assert.equal(byChannel.Email, "2026-09-14");
  assert.equal(byChannel.LinkedIn, "2026-09-14");
  assert.equal(byChannel.SMS, "2026-09-14");
  assert.equal(byChannel.WhatsApp, "2026-09-14");
  assert.equal(byChannel.Phone, "2026-09-18");
});

test("历史任务不挡客户每日一渠：同客户当天已有 Email，SMS 仍可排当天", () => {
  for (const method of ["Manual", "Automated"] as const) {
    const plan = previewSchedule(input({
      start: "2026-09-14",
      method,
      clients: [client({
        clientId: "c1",
        contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("SMS")] }],
      })],
      snapshot: {
        ...OPEN_CAPACITY,
        existingTasks: [{ clientId: "c1", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" }],
      },
    }));
    assert.equal(plan.scheduled[0]?.channel, "SMS");
    assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-14", method);
  }
});

test("OmniReach：客户每日 1 渠道按客户维度计算，不因联系人不同而重置", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Automated",
    clients: [client({
      clientId: "c1",
      contacts: [
        { contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Email")] },
        { contactId: "ct-2", followUpStatus: "Not Contacted", channels: [channel("Phone")] },
      ],
    })],
  }));
  assert.equal(etDate(plan.scheduled.find(task => task.contactId === "ct-1")?.scheduledAt), "2026-09-14");
  // Phone targets the 5th US business day from start (Mon → Fri)
  assert.equal(etDate(plan.scheduled.find(task => task.contactId === "ct-2")?.scheduledAt), "2026-09-18");
});

test("容量不足时更高 Task Priority 先占槽，P2 被顺延", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Automated",
    clients: [
      client({
        clientId: "c-p2",
        clientPriority: "P0",
        contacts: [{ contactId: "ct-p2", followUpStatus: "Not Contacted", channels: [channel("Email")] }],
      }),
      client({
        clientId: "c-p0",
        clientPriority: "P2",
        contacts: [{ contactId: "ct-p0", followUpStatus: "In Progress", channels: [channel("Email")] }],
      }),
    ],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: [] },
  }));
  const byClient = Object.fromEntries(plan.scheduled.map(task => [task.clientId, task]));
  assert.equal(byClient["c-p0"]?.priority, "P1");
  assert.equal(etDate(byClient["c-p0"]?.scheduledAt), "2026-09-14");
  assert.equal(byClient["c-p2"]?.priority, "P2");
  assert.equal(etDate(byClient["c-p2"]?.scheduledAt), "2026-09-15");
});

test("同一 Task Priority 内按客户 Priority 再排序", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Manual",
    clients: [
      client({
        clientId: "c-low",
        clientPriority: "P2" as Priority,
        contacts: [{ contactId: "ct-low", followUpStatus: "Not Contacted", channels: [channel("Email")] }],
      }),
      client({
        clientId: "c-high",
        clientPriority: "P0",
        contacts: [{ contactId: "ct-high", followUpStatus: "Not Contacted", channels: [channel("Email")] }],
      }),
    ],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: [] },
  }));
  assert.equal(plan.scheduled[0]?.clientId, "c-high");
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-14");
  assert.equal(plan.scheduled[1]?.clientId, "c-low");
  assert.equal(etDate(plan.scheduled[1]?.scheduledAt), "2026-09-15");
});

test("OmniReach：超出最晚日期则 Unscheduled", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    latest: "2026-09-14",
    method: "Automated",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: [channel("Email"), channel("Phone")],
      }],
    })],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 1 }, existingTasks: [] },
  }));
  assert.equal(plan.scheduled.length, 1);
  assert.equal(plan.scheduled[0]?.channel, "Email");
  assert.equal(plan.unscheduled[0]?.channel, "Phone");
  assert.equal(plan.unscheduled[0]?.code, "NO_SLOT_IN_WINDOW");
});

test("多个客户共享同一渠道 Daily Max", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Manual",
    clients: [
      client({ clientId: "c1" }),
      client({ clientId: "c2" }),
    ],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: [] },
  }));
  assert.equal(etDate(plan.scheduled.find(task => task.clientId === "c1")?.scheduledAt), "2026-09-14");
  assert.equal(etDate(plan.scheduled.find(task => task.clientId === "c2")?.scheduledAt), "2026-09-15");
});

test("OmniReach：跨周末顺延——Email 周五、Phone 固定从第 5 工作日起", () => {
  const plan = previewSchedule(input({
    start: "2026-09-18",
    method: "Automated",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: [channel("Email"), channel("Phone")],
      }],
    })],
  }));
  // Fri=day1 … Thu=day5 → Phone on 2026-09-24
  assert.deepEqual(plan.scheduled.map(task => etDate(task.scheduledAt)), ["2026-09-18", "2026-09-24"]);
});

test("Phone：从今天起（含）固定排到第 5 个美东工作日", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14", // Monday
    method: "Manual",
    clients: [client({
      clientId: "c1",
      contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Phone")] }],
    })],
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-18"); // Friday
  assert.equal(plan.scheduled[0]?.scheduledAt, easternDateTimeIso("2026-09-18", 9 * 60));
});

test("Phone：第 5 工作日满额后顺延到第 6 个工作日", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Manual",
    clients: [client({
      clientId: "c1",
      contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Phone")] }],
    })],
    snapshot: {
      dailyMax: { Email: 0, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 1 },
      existingTasks: [{ clientId: "other", channel: "Phone", scheduledAt: "2026-09-18", status: "Pending" }],
    },
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-21"); // next Monday = day 6
});

test("Phone：第 6 工作日也满时继续往后找", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    method: "Manual",
    clients: [client({
      clientId: "c1",
      contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Phone")] }],
    })],
    snapshot: {
      dailyMax: { Email: 0, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 1 },
      existingTasks: [
        { clientId: "other-1", channel: "Phone", scheduledAt: "2026-09-18", status: "Pending" },
        { clientId: "other-2", channel: "Phone", scheduledAt: "2026-09-21", status: "Pending" },
      ],
    },
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-22"); // Tuesday = day 7
});

test("Phone：周末起算时从下一个工作日计为第 1 天", () => {
  const plan = previewSchedule(input({
    start: "2026-09-12", // Saturday
    now: "2026-09-12T08:00:00-04:00",
    method: "Manual",
    clients: [client({
      clientId: "c1",
      contacts: [{ contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Phone")] }],
    })],
  }));
  // Mon=1 … Fri=5
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-09-18");
});

test("commit 只把 Scheduled 转成 TaskWrite，Needs Review 不写入", () => {
  const result = commitSchedule(input({
    clients: [
      client({ clientId: "ok" }),
      client({ clientId: "blocked", followUpStatus: "Terminated" }),
    ],
  }));
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0]?.followUpContactId, "ct-1");
  assert.equal(result.writes[0]?.taskStatus, "Pending");
  assert.equal(etDate(result.writes[0]?.scheduledAt), "2026-09-14");
  assert.equal(result.needsReview[0]?.clientId, "blocked");
});

test("commit 使用最新 snapshot 重算，避免并发超额", () => {
  const request = input({
    start: "2026-09-14",
    clients: [client({ clientId: "c-late" })],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: [] },
  });
  const preview = previewSchedule(request);
  assert.equal(etDate(preview.scheduled[0]?.scheduledAt), "2026-09-14");

  const committed = commitSchedule({
    ...request,
    snapshot: {
      dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      existingTasks: [{ clientId: "c-early", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" }],
    },
  });
  assert.equal(etDate(committed.writes[0]?.scheduledAt), "2026-09-15");
});

test("可选 Template 会原样带到写入结果", () => {
  const result = commitSchedule(input({
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: [channel("Email", { templateId: "tpl-welcome" })],
      }],
    })],
  }));
  assert.equal(result.writes[0]?.templateId, "tpl-welcome");
});

test("同日同渠道按 Time interval 错开到分钟", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [
      client({ clientId: "c1" }),
      client({ clientId: "c2" }),
      client({ clientId: "c3" }),
    ],
    snapshot: {
      dailyMax: { Email: 10, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      timeInterval: { Email: 5 },
      existingTasks: [],
    },
  }));
  assert.deepEqual(
    plan.scheduled.map(task => etMinute(task.scheduledAt)),
    [9 * 60, 9 * 60 + 5, 9 * 60 + 10],
  );
});

test("首槽从当前美东时间向后对齐", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    now: "2026-09-14T10:33:20-04:00",
    clients: [client({ clientId: "c1" })],
  }));
  assert.equal(plan.scheduled[0]?.scheduledAt, easternDateTimeIso("2026-09-14", 10 * 60 + 34));
});

test("历史 date-only 任务按当日 09:00 ET 占位参与间隔", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({ clientId: "c1" })],
    snapshot: {
      dailyMax: { Email: 10, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      timeInterval: { Email: 5 },
      existingTasks: [{ clientId: "other", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" }],
    },
  }));
  assert.equal(plan.scheduled[0]?.scheduledAt, easternDateTimeIso("2026-09-14", 9 * 60 + 5));
});

test("Time interval 缺失或非法时回退默认 5 分钟", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [
      client({ clientId: "c1" }),
      client({ clientId: "c2" }),
    ],
    snapshot: {
      dailyMax: { Email: 10, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      timeInterval: { Email: 0 },
      existingTasks: [],
    },
  }));
  assert.equal(etMinute(plan.scheduled[0]?.scheduledAt), 9 * 60);
  assert.equal(etMinute(plan.scheduled[1]?.scheduledAt), 9 * 60 + 5);
});

test("跳过美国联邦假日（2026-07-03 独立日调休）", () => {
  const plan = previewSchedule(input({
    start: "2026-07-03",
    now: "2026-07-03T08:00:00-04:00",
    clients: [client({ clientId: "c1" })],
  }));
  assert.equal(etDate(plan.scheduled[0]?.scheduledAt), "2026-07-06");
});

test("当天已过窗口则顺延下一美东工作日 09:00", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    now: "2026-09-14T17:00:01-04:00",
    clients: [client({ clientId: "c1" })],
  }));
  assert.equal(plan.scheduled[0]?.scheduledAt, easternDateTimeIso("2026-09-15", 9 * 60));
});

test("easternDateOnly 使用 America/New_York", () => {
  assert.equal(easternDateOnly(new Date("2026-09-14T02:00:00.000Z")), "2026-09-13");
});

test("testMode：从当前时间起每 5 分钟排到同一天，忽略容量与客户每日一渠", () => {
  const channels: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];
  const plan = previewSchedule(input({
    start: "2026-09-14",
    now: "2026-09-14T22:10:00-04:00",
    testMode: true,
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: channels.map(name => channel(name)),
      }],
    })],
    snapshot: {
      dailyMax: { Email: 0, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      existingTasks: [{ clientId: "c1", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" }],
    },
  }));
  assert.equal(plan.scheduled.length, 5);
  assert.deepEqual(plan.scheduled.map(task => etDate(task.scheduledAt)), [
    "2026-09-14",
    "2026-09-14",
    "2026-09-14",
    "2026-09-14",
    "2026-09-14",
  ]);
  assert.deepEqual(plan.scheduled.map(task => etMinute(task.scheduledAt)), [
    22 * 60 + 10,
    22 * 60 + 15,
    22 * 60 + 20,
    22 * 60 + 25,
    22 * 60 + 30,
  ]);
});
