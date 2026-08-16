// SLA due-date calculation.
// URGENT = 4 hours (wall clock)
// HIGH = 1 business day
// MEDIUM = 3 business days
// LOW = 5 business days
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

export function computeSlaDueAt(priority: PriorityLevel, from: Date = new Date()): Date {
  switch (priority) {
    case "URGENT": {
      const due = new Date(from.getTime());
      due.setHours(due.getHours() + 4);
      return due;
    }
    case "HIGH":
      return addBusinessDays(from, 1);
    case "MEDIUM":
      return addBusinessDays(from, 3);
    case "LOW":
    default:
      return addBusinessDays(from, 5);
  }
}

export function isOverdue(slaDueAt: Date, status: string): boolean {
  if (status === "RESOLVED" || status === "CLOSED") return false;
  return new Date().getTime() > new Date(slaDueAt).getTime();
}
