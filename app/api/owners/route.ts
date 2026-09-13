import { canAssignBrandOwner } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { queryOwnerPages } from "@/lib/notion/owners";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!canAssignBrandOwner(viewer)) {
      return Response.json({ error: "Only Admin can list owners" }, { status: 403 });
    }
    const owners = (await queryOwnerPages())
      .filter((owner) => owner.status === "Active")
      .map((owner) => ({
        id: owner.id,
        name: owner.name,
        account: owner.account,
      }));
    return Response.json({ owners });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
