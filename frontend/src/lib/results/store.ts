import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Result handles: skills store their full payload here and hand the model only a
 * short summary plus the handle. Components fetch GET /api/results/:id.
 * In-memory is fine for the demo (single server process); swap for Redis/SQLite if needed.
 */
const TTL_MS = 1000 * 60 * 60 * 6;
const store = new Map<string, { value: unknown; expires: number }>();

export function putResult(value: unknown, kind: string): string {
  const id = `${kind}_${randomUUID().slice(0, 8)}`;
  store.set(id, { value, expires: Date.now() + TTL_MS });
  return id;
}

export function getResult<T = unknown>(id: string): T | undefined {
  const hit = store.get(id);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(id);
    return undefined;
  }
  return hit.value as T;
}
