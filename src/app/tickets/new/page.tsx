import { redirect } from "next/navigation";

// Backwards-compat: the app was single-project (RAQABA+) before the
// multi-project refactor, so old bookmarked/shared links to /tickets/new
// redirect to the now-canonical project-scoped URL instead of 404ing.
export default function LegacyNewTicketRedirect() {
  redirect("/raqaba/tickets/new");
}
