import { ZodError } from 'zod';

/**
 * Every /api/admin/* route built its own local `json()` helper identically —
 * one shared, typed version instead of ten untyped copies.
 */
export function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Every route's `catch` block on a schema `.parse()` needs the same thing: the
 * structured per-field issues when it really was a validation failure, and a
 * plain string otherwise. `err.errors` (every route used this) doesn't exist
 * on zod's ZodError in this version — it's `.issues` — so every validation
 * error response has actually been sending `details: "ZodError: ..."` (the
 * stringified fallback) instead of the real field-level list, silently, since
 * these routes were first written. `err instanceof ZodError` is the correct,
 * type-safe way to get at it.
 */
export function issuesOf(err: unknown): ZodError['issues'] | string {
  return err instanceof ZodError ? err.issues : String(err);
}

/** Uniform 400 response for a schema validation failure. */
export function validationError(label: string, err: unknown): Response {
  return json({ error: `Invalid ${label}`, details: issuesOf(err) }, 400);
}
