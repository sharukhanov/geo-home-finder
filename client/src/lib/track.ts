// Funnel tracking, first-party and minimal.
//
// No third-party script, no cookies, nothing personal: each step is sent with
// the same anonymous browser id the rest of the app already uses, plus where
// the visit came from. Ad blockers have nothing to block, because this is our
// own endpoint.

import { getUserId } from "./user-id";

export type EventName = "open" | "place_added" | "zone_shown" | "address_checked";

const SOURCE_KEY = "fatera-source";

/**
 * Where this visit came from: the campaign tag on the link if there is one,
 * otherwise the site that linked here. Resolved once and remembered for the
 * session, because the tag is only on the first URL — later events would
 * otherwise all look like direct visits.
 */
function resolveSource(): string {
  try {
    const stored = sessionStorage.getItem(SOURCE_KEY);
    if (stored) return stored;
  } catch {
    // sessionStorage unavailable — fall through and recompute each time.
  }

  let source = "";
  try {
    const utm = new URLSearchParams(window.location.search).get("utm_source");
    if (utm) {
      source = utm.slice(0, 60);
    } else if (document.referrer) {
      source = new URL(document.referrer).hostname;
    }
  } catch {
    source = "";
  }

  try {
    if (source) sessionStorage.setItem(SOURCE_KEY, source);
  } catch {
    // ignore
  }
  return source;
}

export function track(name: EventName, props?: Record<string, unknown>): void {
  const body = JSON.stringify({
    userId: getUserId(),
    name,
    source: resolveSource() || null,
    props: props ? JSON.stringify(props).slice(0, 500) : null,
  });

  try {
    // keepalive so the request still goes out if the page is being closed —
    // the last step a visitor reaches is the one we most want to know about.
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Measurement must never disturb the thing being measured.
    });
  } catch {
    // ignore
  }
}

/** Send a step at most once per page load (e.g. "reached the result"). */
const sentOnce = new Set<string>();
export function trackOnce(name: EventName, props?: Record<string, unknown>): void {
  if (sentOnce.has(name)) return;
  sentOnce.add(name);
  track(name, props);
}
