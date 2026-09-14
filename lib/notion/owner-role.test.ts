import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminRole, ownerRoleFromRecord, parseOwnerRole } from "./owner-role.ts";

describe("parseOwnerRole", () => {
  it("maps OwnerDB Admin to Admin", () => {
    assert.equal(parseOwnerRole("Admin"), "Admin");
    assert.equal(parseOwnerRole("管理员"), "Admin");
  });

  it("maps Owner / FC_Owner to FC_Owner", () => {
    assert.equal(parseOwnerRole("Owner"), "FC_Owner");
    assert.equal(parseOwnerRole("FC_Owner"), "FC_Owner");
    assert.equal(parseOwnerRole("FC-Owner"), "FC_Owner");
    assert.equal(parseOwnerRole("fc_owner"), "FC_Owner");
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
  it("defaults empty Role to FC_Owner", () => {
    assert.equal(ownerRoleFromRecord(""), "FC_Owner");
  });
});

describe("isAdminRole", () => {
  it("is true only for Admin", () => {
    assert.equal(isAdminRole("Admin"), true);
    assert.equal(isAdminRole("FC_Owner"), false);
    assert.equal(isAdminRole("Caller"), false);
  });
});
