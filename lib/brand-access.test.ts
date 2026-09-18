import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessTestBrands,
  canViewBrand,
  canViewTask,
  isTestOnlyViewer,
  type BrandViewer,
} from "./brand-access.ts";
import type { BrandListItem, BrandTask } from "./brand-list.ts";

function viewer(partial: Partial<BrandViewer>): BrandViewer {
  return {
    isAdmin: false,
    role: "Caller",
    email: null,
    ownerId: "owner-1",
    name: null,
    ...partial,
  };
}

const prodBrand = {
  id: "brand-prod",
  name: "Prod",
  ownerId: "owner-1",
  isTest: false,
} as BrandListItem;

const testBrand = {
  id: "brand-test",
  name: "Test",
  ownerId: "owner-1",
  isTest: true,
} as BrandListItem;

const prodPhone = {
  id: "task-prod",
  channel: "Phone",
  brandIsTest: false,
  ownerId: "owner-1",
  brandOwnerId: "owner-1",
} as BrandTask;

const testPhone = {
  id: "task-test",
  channel: "Phone",
  brandIsTest: true,
  ownerId: "owner-1",
  brandOwnerId: "owner-1",
} as BrandTask;

const testEmail = {
  id: "task-email",
  channel: "Email",
  brandIsTest: true,
  ownerId: "owner-1",
  brandOwnerId: "owner-1",
} as BrandTask;

describe("isTestOnlyViewer", () => {
  it("matches TestCaller account case-insensitively", () => {
    assert.equal(isTestOnlyViewer({ email: "TestCaller@fridgechannels.com" }), true);
    assert.equal(isTestOnlyViewer({ email: "testcaller@fridgechannels.com" }), true);
  });

  it("does not match other callers", () => {
    assert.equal(isTestOnlyViewer({ email: "alex@fridgechannels.com" }), false);
  });
});

describe("canAccessTestBrands", () => {
  it("allows TestCaller and AccountManager", () => {
    assert.equal(
      canAccessTestBrands(viewer({ email: "testcaller@fridgechannels.com" })),
      true,
    );
    assert.equal(canAccessTestBrands(viewer({ role: "AccountManager" })), true);
  });

  it("hides test data from normal Caller / Admin", () => {
    assert.equal(canAccessTestBrands(viewer({ email: "alex@fridgechannels.com" })), false);
    assert.equal(
      canAccessTestBrands(viewer({ isAdmin: true, role: "Admin", email: "admin@fridgechannels.com" })),
      false,
    );
  });
});

describe("TestCaller task/brand ACL", () => {
  const testCaller = viewer({
    email: "testcaller@fridgechannels.com",
    role: "Caller",
    ownerId: "caller-owner",
  });

  it("only sees Is Test Phone tasks", () => {
    assert.equal(canViewTask(testCaller, testPhone), true);
    assert.equal(canViewTask(testCaller, prodPhone), false);
    assert.equal(canViewTask(testCaller, testEmail), false);
  });

  it("only sees Is Test brands via Phone tasks", () => {
    assert.equal(canViewBrand(testCaller, testBrand), false);
    assert.equal(canViewBrand(testCaller, testBrand, [testPhone]), true);
    assert.equal(canViewBrand(testCaller, prodBrand, [prodPhone]), false);
  });

  it("normal Caller still cannot see Is Test Phone", () => {
    const caller = viewer({ email: "alex@fridgechannels.com", role: "Caller" });
    assert.equal(canViewTask(caller, testPhone), false);
    assert.equal(canViewTask(caller, prodPhone), true);
  });
});
