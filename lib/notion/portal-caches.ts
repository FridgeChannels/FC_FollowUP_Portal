import { clearBrandListPageCache } from "../brand-list-cache";
import { clearBrandPageCache } from "./brand-page-cache";
import { invalidateBrandReplySignalCache } from "./brand-reply-signal-cache";
import { invalidateExhibitionOptionsCache } from "./exhibition-options-cache";

/** Server-side Notion/list caches used by Brands and related APIs. */
export function invalidateAllPortalCaches() {
  invalidateBrandReplySignalCache();
  invalidateExhibitionOptionsCache();
  clearBrandPageCache();
}

/**
 * Browser-side brand list page cache (sessionStorage). Safe no-op on server.
 * Call from the client after a successful Admin cache clear.
 */
export function clearClientPortalCaches() {
  clearBrandListPageCache();
}
