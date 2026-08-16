import { redirect } from "next/navigation";

// Backwards-compat redirect — see src/app/tickets/new/page.tsx for rationale.
export default function LegacyTrackTicketRedirect({
  searchParams,
}: {
  searchParams: { ticketNumber?: string; phone?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.ticketNumber) qs.set("ticketNumber", searchParams.ticketNumber);
  if (searchParams.phone) qs.set("phone", searchParams.phone);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/raqaba/tickets/track${suffix}`);
}
