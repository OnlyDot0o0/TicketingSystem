import { redirect } from "next/navigation";

// Backwards-compat redirect — see src/app/tickets/new/page.tsx for rationale.
export default async function LegacyTrackTicketRedirect({
  searchParams,
}: {
  searchParams: Promise<{ ticketNumber?: string; phone?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const qs = new URLSearchParams();
  if (resolvedSearchParams.ticketNumber) qs.set("ticketNumber", resolvedSearchParams.ticketNumber);
  if (resolvedSearchParams.phone) qs.set("phone", resolvedSearchParams.phone);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/raqaba/tickets/track${suffix}`);
}
