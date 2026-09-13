import assert from "node:assert/strict";
import { test } from "node:test";
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
  existingTasks: [],
};

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
  clients: ClientSelection[];
  snapshot?: ScheduleSnapshot;
}): ScheduleInput {
  return {
    request: {
      preferredStartDate: options.start ?? "2026-09-14",
      latestDate: options.latest,
      maxHorizonDays: options.horizon,
      creationMethod: options.method ?? "Manual",
      clients: options.clients,
    },
    snapshot: options.snapshot ?? OPEN_CAPACITY,
  };
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

test("Preferred Start Date 落在周末时，从下一个工作日起排", () => {
  const plan = previewSchedule(input({
    start: "2026-09-12",
    clients: [client({ clientId: "c1" })],
  }));
  assert.equal(plan.scheduled[0]?.scheduledAt, "2026-09-14");
});

test("渠道当日容量用尽后顺延到下一个工作日", () => {
  const existing: ExistingTask[] = [
    { clientId: "other", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" },
  ];
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({ clientId: "c1" })],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: existing },
  }));
  assert.equal(plan.scheduled[0]?.scheduledAt, "2026-09-15");
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
  assert.equal(plan.scheduled[0]?.scheduledAt, "2026-09-14");
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
  assert.equal(plan.scheduled[0]?.scheduledAt, "2026-09-15");
});

test("Daily Max 为 0 时该渠道任务 Unscheduled", () => {
  const plan = previewSchedule(input({
    clients: [client({ clientId: "c1" })],
    snapshot: { dailyMax: { Email: 0, LinkedIn: 10, SMS: 10, WhatsApp: 10, Phone: 10 }, existingTasks: [] },
  }));
  assert.equal(plan.scheduled.length, 0);
  assert.equal(plan.unscheduled[0]?.code, "CHANNEL_PAUSED");
});

test("同一客户每天只排 1 个渠道，5 个渠道至少跨 5 个工作日", () => {
  const channels: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: channels.map(name => channel(name)),
      }],
    })],
  }));
  const dates = plan.scheduled.map(task => task.scheduledAt);
  assert.deepEqual(dates, ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
  assert.equal(new Set(dates).size, 5);
});

test("客户当天已有未取消任务时，即使其他渠道有容量也必须顺延", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
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
  assert.equal(plan.scheduled[0]?.scheduledAt, "2026-09-15");
});

test("客户每日 1 渠道按客户维度计算，不因联系人不同而重置", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    clients: [client({
      clientId: "c1",
      contacts: [
        { contactId: "ct-1", followUpStatus: "Not Contacted", channels: [channel("Email")] },
        { contactId: "ct-2", followUpStatus: "Not Contacted", channels: [channel("Phone")] },
      ],
    })],
  }));
  assert.equal(plan.scheduled.find(task => task.contactId === "ct-1")?.scheduledAt, "2026-09-14");
  assert.equal(plan.scheduled.find(task => task.contactId === "ct-2")?.scheduledAt, "2026-09-15");
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
  assert.equal(byClient["c-p0"]?.scheduledAt, "2026-09-14");
  assert.equal(byClient["c-p2"]?.priority, "P2");
  assert.equal(byClient["c-p2"]?.scheduledAt, "2026-09-15");
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
  assert.equal(plan.scheduled[0]?.scheduledAt, "2026-09-14");
  assert.equal(plan.scheduled[1]?.clientId, "c-low");
  assert.equal(plan.scheduled[1]?.scheduledAt, "2026-09-15");
});

test("超出最晚日期则 Unscheduled", () => {
  const plan = previewSchedule(input({
    start: "2026-09-14",
    latest: "2026-09-14",
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
  assert.equal(plan.scheduled.find(task => task.clientId === "c1")?.scheduledAt, "2026-09-14");
  assert.equal(plan.scheduled.find(task => task.clientId === "c2")?.scheduledAt, "2026-09-15");
});

test("跨周末顺延：周五已占客户日，下一槽是下周一", () => {
  const plan = previewSchedule(input({
    start: "2026-09-18",
    clients: [client({
      clientId: "c1",
      contacts: [{
        contactId: "ct-1",
        followUpStatus: "Not Contacted",
        channels: [channel("Email"), channel("Phone")],
      }],
    })],
  }));
  assert.deepEqual(plan.scheduled.map(task => task.scheduledAt), ["2026-09-18", "2026-09-21"]);
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
  assert.equal(result.writes[0]?.scheduledAt, "2026-09-14");
  assert.equal(result.needsReview[0]?.clientId, "blocked");
});

test("commit 使用最新 snapshot 重算，避免并发超额", () => {
  const request = input({
    start: "2026-09-14",
    clients: [client({ clientId: "c-late" })],
    snapshot: { dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 }, existingTasks: [] },
  });
  const preview = previewSchedule(request);
  assert.equal(preview.scheduled[0]?.scheduledAt, "2026-09-14");

  const committed = commitSchedule({
    ...request,
    snapshot: {
      dailyMax: { Email: 1, LinkedIn: 0, SMS: 0, WhatsApp: 0, Phone: 0 },
      existingTasks: [{ clientId: "c-early", channel: "Email", scheduledAt: "2026-09-14", status: "Pending" }],
    },
  });
  assert.equal(committed.writes[0]?.scheduledAt, "2026-09-15");
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
