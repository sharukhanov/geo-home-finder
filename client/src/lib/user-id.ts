// Anonymous per-device identity.
//
// Until real accounts exist, each browser gets its own random id stored in
// localStorage. This keeps every visitor's points and zones separate without
// requiring a login. If localStorage is unavailable we fall back to a shared
// id so the app still works (just without separation).

const STORAGE_KEY = "fatera-user-id";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getUserId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage can throw (Safari private mode, blocked site data). A shared
    // constant here would put every such visitor in the same bucket, showing
    // them each other's places — so fall back to a per-tab random id instead.
    // Their data simply won't survive a reload.
    if (!sessionId) sessionId = generateId();
    return sessionId;
  }
}

let sessionId: string | null = null;
