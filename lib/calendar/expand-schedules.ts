import { DateTime } from "luxon";
import { RRule, rrulestr } from "rrule";
import { addDays } from "@/lib/calendar/dates";
import { normalizeBusinessDay } from "@/lib/calendar/holidays";
import { monthEndMonthlyDay, monthEndOccurrencesBetween } from "@/lib/calendar/month-clamp";
import { logger } from "@/lib/logger";
import { toCents } from "@/lib/money/numeric";

export interface ScheduleRow {
  amount: string;
  direction: "inflow" | "outflow";
  nextDueDate: string;
  recurrenceRrule: string;
}

export interface ExpandedEvents {
  eventsByDate: Record<string, { inflowCents: number; outflowCents: number }>;
  /** ISO dates (normalized) that are income deposits inside the horizon. */
  paydayDates: string[];
}

function toRRuleDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toIsoDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISODate() ?? "";
}

/** Expand active schedules across [today, today+60], then business-day normalize (module 3). */
export function expandSchedules(input: {
  schedules: ScheduleRow[];
  today: string;
  holidays: Set<string>;
  horizonDays?: number;
}): ExpandedEvents {
  const horizon = input.horizonDays ?? 60;
  const until = addDays(input.today, horizon);
  const eventsByDate: Record<string, { inflowCents: number; outflowCents: number }> = {};
  const paydayDates: string[] = [];

  for (const schedule of input.schedules) {
    const amountCents = toCents(schedule.amount);
    const ruleText = schedule.recurrenceRrule.trim().toUpperCase().startsWith("RRULE:")
      ? schedule.recurrenceRrule.trim()
      : `RRULE:${schedule.recurrenceRrule.trim()}`;

    // D11 — a bill due on the 29th-31st (or the last day) lands on the last day of a short month.
    const monthEndDay = monthEndMonthlyDay(ruleText);
    if (monthEndDay !== null) {
      const dates = monthEndOccurrencesBetween({
        anchor: schedule.nextDueDate,
        byMonthDay: monthEndDay,
        from: input.today,
        until,
      });
      for (const iso of dates) {
        addOccurrence(
          eventsByDate,
          paydayDates,
          iso,
          schedule.direction,
          amountCents,
          input.holidays,
          input.today,
          until,
        );
      }
      continue;
    }

    let rule: RRule;
    try {
      rule = rrulestr(ruleText, {
        dtstart: toRRuleDate(schedule.nextDueDate),
      }) as RRule;
    } catch (error: unknown) {
      // Fall back to a single occurrence on next_due_date.
      logger.info("RRULE parse fell back to a single occurrence", {
        error: error instanceof Error ? error.message : "unknown",
      });
      addOccurrence(
        eventsByDate,
        paydayDates,
        schedule.nextDueDate,
        schedule.direction,
        amountCents,
        input.holidays,
        input.today,
        until,
      );
      continue;
    }

    const dates = rule.between(toRRuleDate(input.today), toRRuleDate(until), true);
    // Include next_due_date when it is today or later even if rrule misses it.
    const isoSet = new Set(dates.map(toIsoDate));
    if (schedule.nextDueDate >= input.today && schedule.nextDueDate <= until) {
      isoSet.add(schedule.nextDueDate);
    }

    for (const iso of isoSet) {
      addOccurrence(
        eventsByDate,
        paydayDates,
        iso,
        schedule.direction,
        amountCents,
        input.holidays,
        input.today,
        until,
      );
    }
  }

  paydayDates.sort();
  return { eventsByDate, paydayDates };
}

function addOccurrence(
  eventsByDate: Record<string, { inflowCents: number; outflowCents: number }>,
  paydayDates: string[],
  calendarDate: string,
  direction: "inflow" | "outflow",
  amountCents: number,
  holidays: Set<string>,
  today: string,
  until: string,
): void {
  const normalized = normalizeBusinessDay(calendarDate, direction, holidays);
  if (normalized < today || normalized > until) {
    return;
  }
  const bucket = eventsByDate[normalized] ?? { inflowCents: 0, outflowCents: 0 };
  if (direction === "inflow") {
    bucket.inflowCents += amountCents;
    if (!paydayDates.includes(normalized)) {
      paydayDates.push(normalized);
    }
  } else {
    bucket.outflowCents += amountCents;
  }
  eventsByDate[normalized] = bucket;
}
