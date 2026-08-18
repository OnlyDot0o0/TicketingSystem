import { NextRequest, NextResponse } from "next/server";
import { getStorage, assertSafeKey } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { getViewerScope, canAccessProject } from "@/lib/access";
import { verifyAttachmentToken } from "@/lib/attachmentAccess";

// Files live outside /public specifically so they are NOT statically
// servable. Two ways in: an authenticated staff session with access to
// the attachment's project, OR a short-lived signed token (see
// src/lib/attachmentAccess.ts) for the public submitter-tracking flow,
// which has no session to check. Neither present → 403. This used to be
// "add access control later" — that seam is now used.
//
// Reads go through src/lib/storage.ts's ObjectStorage abstraction (local
// disk by default, or S3-compatible if STORAGE_DRIVER=s3) instead of the
// filesystem directly — this route used to be the one place that read
// straight off disk, which would have made the S3 driver write-only (files
// saved there but never servable) if it hadn't been updated too.
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const relPath = params.path.join("/");

  try {
    // Storage-agnostic traversal check — an S3 key has no filesystem to
    // traverse out of, but a ".." segment still isn't a key this app ever
    // legitimately generated (see assertSafeKey in src/lib/storage.ts).
    assertSafeKey(relPath);
  } catch {
    return NextResponse.json({ error: "غير صالح" }, { status: 400 });
  }

  try {
    // Look up the tracked Attachment row for this path so we can serve the
    // MIME type that was actually validated at upload time, instead of
    // leaving Content-Type unset (which makes the browser guess/sniff it —
    // a real risk for a file whose extension doesn't match its declared
    // type, and generally the wrong way to serve images/PDFs anyway: they'd
    // often download instead of previewing inline). A path with no
    // matching Attachment row isn't a file this app ever legitimately
    // served, so treat it as not-found rather than serving raw bytes with
    // no type information.
    const attachment = await prisma.attachment.findFirst({
      where: { path: relPath },
      include: { ticket: { select: { projectId: true } } },
    });
    if (!attachment) {
      return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
    }

    const tokenOk = verifyAttachmentToken(
      relPath,
      req.nextUrl.searchParams.get("exp"),
      req.nextUrl.searchParams.get("sig")
    );
    if (!tokenOk) {
      const scope = await getViewerScope();
      if (!scope || !canAccessProject(scope, attachment.ticket.projectId)) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }
    }

    const data = await getStorage().read(relPath);
    // NextResponse's BodyInit type doesn't accept a Node Buffer directly
    // under this project's installed TypeScript/@types/node combination —
    // a known friction point since TS 5.7 made typed arrays generic over
    // their backing buffer (Buffer.buffer is typed ArrayBufferLike, which
    // includes SharedArrayBuffer and so isn't assignable to DOM's
    // ArrayBuffer-backed BufferSource). The single-argument Uint8Array copy
    // constructor allocates a fresh, plain ArrayBuffer, which resolves the
    // type mismatch; attachments are capped at 8MB (MAX_UPLOAD_SIZE_BYTES),
    // so the extra copy is cheap. This is a pre-existing TS/Node typing
    // wrinkle in this route unrelated to the storage-abstraction change
    // itself — the original readFile()-based version had the same issue.
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": attachment.mimeType,
        // RFC 5987/6266 encoding (filename*=UTF-8''...) so non-ASCII names
        // (this is an Arabic-first app — attachment names are routinely
        // Arabic) survive intact as the "save as" filename instead of
        // being mangled or stripped by browsers that don't handle raw
        // UTF-8 bytes in a quoted Content-Disposition filename.
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Cache-Control": "private, max-age=3600",
        // This response's authorization depends on the request's session
        // cookie (or signed token). Without Vary, a browser's private
        // cache would key purely on URL — on a SHARED device, one staff
        // member's session could legitimately fetch and cache an image,
        // then a different account signing in on that same browser could
        // be served the stale cached response without a fresh auth check
        // ever happening. Vary: Cookie tells the browser cache to key on
        // the cookie too, not just the URL.
        Vary: "Cookie",
      },
    });
  } catch {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }
}
