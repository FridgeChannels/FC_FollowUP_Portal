import assert from "node:assert/strict";
import { it } from "node:test";
import { isBrandAssignedToViewer, type BrandViewer } from "../brand-access.ts";
import { ADMIN_SIGNALS_ACCOUNT, resolveSignalsAssignment } from "./assignment.ts";

const admin: BrandViewer = {
  isAdmin: true,
  role: "Admin",
  email: "admin@example.com",
  ownerId: "admin-owner",
  name: "Admin",
};

it("scopes an Admin feed to Billy's assigned brands rather than the signed-in Admin", async () => {
  const assignment = await resolveSignalsAssignment(admin, async (account) => {
    assert.equal(account, "billy@fridgechannels.com");
    return { id: "billy-owner" };
  });
  assert.equal(isBrandAssignedToViewer(assignment, { ownerId: "billy-owner", ownerEmail: null }), true);
  assert.equal(isBrandAssignedToViewer(assignment, { ownerId: "admin-owner", ownerEmail: admin.email }), false);
  assert.equal(isBrandAssignedToViewer(assignment, { ownerId: null, ownerEmail: null }), false);
  assert.equal(admin.ownerId, "admin-owner");
});

it("keeps the Billy email scope when no owner record resolves, without granting all-brand access", async () => {
  const assignment = await resolveSignalsAssignment(admin, async () => null);
  assert.deepEqual(assignment, { ownerId: null, email: ADMIN_SIGNALS_ACCOUNT });
  assert.equal(isBrandAssignedToViewer(assignment, { ownerId: "other-owner", ownerEmail: "other@example.com" }), false);
  assert.equal(isBrandAssignedToViewer(assignment, { ownerId: "billy-owner", ownerEmail: "Billy@fridgechannels.com" }), true);
});

it("preserves an Account Manager's own assignment without looking up Billy", async () => {
  const manager: BrandViewer = { ...admin, isAdmin: false, role: "AccountManager" };
  const assignment = await resolveSignalsAssignment(manager, async () => { throw new Error("Unexpected lookup"); });
  assert.deepEqual(assignment, { ownerId: manager.ownerId, email: manager.email });
});
