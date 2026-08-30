/**
 * The trailing-window rate-limit step shared by the three decision cores
 * (chess claim, contact, JTB turn): each counts this caller's recorded
 * attempts since a `windowStart` timestamp and compares against its own max
 * (10/min chess & JTB, 5/hour contact — the limits live in each domain's
 * constants). This module owns only the math the three copies used to
 * duplicate: the window-start conversion and its clock-skew grace.
 */

/**
 * Grace added beyond the nominal window when converting to a `since` bound,
 * so a recorded attempt timestamped within a second of the boundary (clock
 * drift between app server and database, or an in-flight write landing just
 * after the count RPC) is still counted rather than escaping the window.
 */
const CLOCK_SKEW_GRACE_MS = 1000;

/** ISO boundary for "attempts recorded in the trailing windowMs". */
export function rateWindowStart(nowMs: number, windowMs: number): string {
  return new Date(nowMs - (windowMs + CLOCK_SKEW_GRACE_MS)).toISOString();
}
