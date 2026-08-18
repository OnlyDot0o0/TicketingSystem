// SLA due-date calculation.
//
// v6: SLA-by-priority targets are per-project (Project.slaUrgentHours /
// slaHighDays / slaMediumDays / slaLowDays) instead of the fixed global
// constants this used to hardcode. Column defaults on Project preserve
// today's exact original values (URGENT=4h, HIGH=1 business day,
// MEDIUM=3 business days, LOW=5 business days) for every project that
// hasn't explicitly changed them.
//
// "Business day" = Sun-Thu in Saudi/Egypt context is arguable; to keep this
// simple and unambiguous we treat Fri/Sat as the weekend (common across the
// GCC). Adjust WEEKEND_DAYS below if the target region differs.

const WEEKEND_DAYS = new Set([5, 6]); // 5 = Friday, 6 = Saturday (JS getDay())

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!WEEKEND_DAYS.has(result.getDay())) {
      remaining -= 1;
    }
  }
  return result;
}

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type SlaConfig = {
  slaUrgentHours: number;
  slaHighDays: number;
  slaMediumDays: number;
  slaLowDays: number;
};

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  slaUrgentHours: 4,
  slaHighDays: 1,
  slaMediumDays: 3,
  slaLowDays: 5,
};

export function computeSlaDueAt(
  priority: PriorityLevel,
  config: SlaConfig,
  from: Date = new Date()
): Date {
  switch (priority) {
    case "URGENT": {
      const due = new Date(from.getTime());
      due.setHours(due.getHours() + config.slaUrgentHours);
      return due;
    }
    case "HIGH":
      return addBusinessDays(from, config.slaHighDays);
    case "MEDIUM":
      return addBusinessDays(from, config.slaMediumDays);
    case "LOW":
    default:
      return addBusinessDays(from, config.slaLowDays);
  }
}

export function isOverdue(slaDueAt: Date, status: string): boolean {
  if (status === "RESOLVED" || status === "CLOSED") return false;
  return new Date().getTime() > new Date(slaDueAt).getTime();
}
