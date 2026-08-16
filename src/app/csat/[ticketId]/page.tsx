import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicHeader, PublicFooter } from "@/components/PublicShell";

// Public, unauthenticated one-click CSAT rating landing page, linked from
// the 5 star links in the "resolved" notification email
// (src/lib/notifications.ts notifyResolved). Ticket ids are unguessable
// cuids and this is a low-stakes action — same trust model this app
// already uses for attachment URLs (/api/uploads/[...path]) — so no
// separate signed token was added just for this.
//
// Idempotent: if the ticket already has a rating, clicking a (possibly
// different) star link again does NOT overwrite it — we just inform the
// submitter of the rating already on file rather than silently changing it
// or blocking with an error.
export default async function CsatPage({
  params,
  searchParams,
}: {
  params: { ticketId: string };
  searchParams: { rating?: string };
}) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.ticketId },
    include: { project: true },
  });
  if (!ticket) notFound();

  const ratingParam = searchParams.rating ? parseInt(searchParams.rating, 10) : NaN;
  const requestedRating = Number.isInteger(ratingParam) && ratingParam >= 1 && ratingParam <= 5 ? ratingParam : null;

  let currentRating = ticket.satisfactionRating;
  let justRated = false;

  if (requestedRating !== null && currentRating === null) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { satisfactionRating: requestedRating, satisfactionSubmittedAt: new Date() },
    });
    currentRating = requestedRating;
    justRated = true;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader project={ticket.project} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 py-16 text-center">
        <p className="text-xs text-ink-soft" dir="ltr">{ticket.ticketNumber}</p>

        {currentRating !== null ? (
          <>
            <p className="mt-3 text-3xl" aria-hidden>{"⭐".repeat(currentRating)}</p>
            <h1 className="mt-4 text-xl font-extrabold" style={{ color: "var(--accent)" }}>
              {justRated ? "شكرًا لتقييمك" : `تم تقييم هذه التذكرة مسبقًا بـ ${currentRating}/5`}
            </h1>
            <p className="mt-3 max-w-sm text-sm text-ink-soft">
              {justRated
                ? "نقدّر وقتك في تقييم تجربتك مع فريق الدعم."
                : "تم تسجيل هذا التقييم من قبل ولن يتم تغييره من هذا الرابط."}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-xl font-extrabold" style={{ color: "var(--accent)" }}>
              ما مدى رضاك عن حل تذكرتك؟
            </h1>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <a
                  key={n}
                  href={`/csat/${ticket.id}?rating=${n}`}
                  className="btn btn-outline text-lg"
                  aria-label={`تقييم ${n} من 5`}
                >
                  {"⭐".repeat(n)}
                </a>
              ))}
            </div>
          </>
        )}
      </main>
      <PublicFooter project={ticket.project} />
    </div>
  );
}
