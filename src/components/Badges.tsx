import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/config";

function toneStyle(tone: "neutral" | "amber" | "red" | "teal" | "green") {
  switch (tone) {
    case "amber":
      return { background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)", borderColor: "var(--accent)" };
    case "red":
      return { background: "rgba(200,50,45,0.12)", color: "#c8322d", borderColor: "#c8322d" };
    case "teal":
      return { background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)", borderColor: "var(--teal)" };
    case "green":
      return { background: "rgba(46,125,80,0.12)", color: "#2e7d50", borderColor: "#2e7d50" };
    default:
      return { background: "color-mix(in srgb, var(--ink) 6%, transparent)", color: "var(--ink-soft)" };
  }
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "RESOLVED" || status === "CLOSED"
      ? "green"
      : status === "PENDING"
      ? "amber"
      : status === "OPEN"
      ? "teal"
      : "neutral";
  return (
    <span className="badge" style={toneStyle(tone)}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === "URGENT" ? "red" : priority === "HIGH" ? "amber" : "neutral";
  return (
    <span className="badge" style={toneStyle(tone)}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="badge" style={toneStyle("neutral")}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="badge" style={toneStyle("red")}>
      متأخرة
    </span>
  );
}
