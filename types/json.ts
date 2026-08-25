/**
 * Flat JSON-object payload for RPC metadata (chat-interaction audit rows,
 * chess reward metadata). Deliberately flat — nested blobs are not metadata.
 */
export type JsonObject = Record<string, string | number | boolean | null>;
