import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminRole, ownerRoleFromRecord, parseOwnerRole } from "./owner-role.ts";

describe("parseOwnerRole", () => {
  it("maps OwnerDB Admin to Admin", () => {
    assert.equal(parseOwnerRole("Admin"), "Admin");
    assert.equal(parseOwnerRole("管理员"), "Admin");
  });

  it("maps Owner / AccountManager to AccountManager", () => {
    assert.equal(parseOwnerRole("Owner"), "AccountManager");
    assert.equal(parseOwnerRole("AccountManager"), "AccountManager");
    assert.equal(parseOwnerRole("FC-Owner"), "AccountManager");
    assert.equal(parseOwnerRole("fc_owner"), "AccountManager");
  });

  it("maps Caller to Caller", () => {
    assert.equal(parseOwnerRole("Caller"), "Caller");
  });

  it("returns null for unknown values", () => {
    assert.equal(parseOwnerRole(""), null);
    assert.equal(parseOwnerRole("Viewer"), null);
  });
});

describe("ownerRoleFromRecord", () => {
  it("defaults empty Role to AccountManager", () => {
    assert.equal(ownerRoleFromRecord(""), "AccountManager");
  });
});

describe("isAdminRole", () => {
  it("is true only for Admin", () => {
    assert.equal(isAdminRole("Admin"), true);
    assert.equal(isAdminRole("AccountManager"), false);
    assert.equal(isAdminRole("Caller"), false);
  });
});
