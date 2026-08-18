// Pure decision logic for the public CSAT rating landing page
// (src/app/csat/[ticketId]/page.tsx), extracted out of the page component so
// it's unit-testable without needing a JSX/React rendering toolchain in the
// test runner — the page itself just calls these and does the DB write.
//
// Idempotency rule: a ticket that already has a satisfactionRating must
// NEVER be silently overwritten by a later (possibly different) star-rating
// click — the page just reports the rating already on file instead of
// changing it or erroring.

export function parseCsatRatingParam(raw: string | undefined): number | null {
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export function resolveCsatRating(
  currentRating: number | null,
  requestedRating: number | null
): { rating: number | null; shouldRecord: boolean } {
  if (requestedRating !== null && currentRating === null) {
    return { rating: requestedRating, shouldRecord: true };
  }
  // Either there's no valid requested rating, or one is already on file —
  // either way, nothing gets written; the existing rating (if any) stands.
  return { rating: currentRating, shouldRecord: false };
}
