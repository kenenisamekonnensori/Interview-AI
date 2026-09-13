export type UsagePeriod = { start: Date; end: Date };

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function startOfNextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/**
 * The usage window is the subscription's current billing period whenever the
 * account is inside a paid period, and the calendar month otherwise (free plan).
 *
 * Both windows are derived on demand from the current time and the synced
 * subscription row, so nothing resets counters on a schedule: a new window is
 * simply a different `periodStart`, and the counter row for the previous window
 * is ignored. That is why there is no fragile "reset all counters on the 1st"
 * job anywhere in this system.
 */
export function usagePeriodFor(
  subscription: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null } | null,
  now: Date = new Date(),
): UsagePeriod {
  const start = subscription?.currentPeriodStart ?? null;
  const end = subscription?.currentPeriodEnd ?? null;
  if (start && end && end.getTime() > now.getTime() && start.getTime() <= now.getTime()) {
    return { start, end };
  }
  return { start: startOfUtcMonth(now), end: startOfNextUtcMonth(now) };
}
