/**
 * The wire-message vocabulary shared by both sides of the API: server routes
 * phrase every error code exactly once (via the per-core outcome tables —
 * describeOutcome in each decision core), and client submit UI falls back to
 * the same strings instead of re-typing them. Client-safe: imports nothing.
 */

/** 5xx catch-all — our fault, never caller behaviour. */
export const INTERNAL_SERVER_MESSAGE =
  "Something went wrong on our side — please try again.";

/** The request body was not parseable JSON. */
export const INVALID_JSON_MESSAGE = "Request body must be valid JSON.";

/** Client-side fetch failure — the server may never have been reached. */
export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server — check your connection.";

/** A response arrived whose body did not match the typed shape. */
export const UNEXPECTED_RESPONSE_MESSAGE = "Unexpected server response.";
