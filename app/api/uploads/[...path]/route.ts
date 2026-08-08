import { NextResponse } from "next/server";
import { getAuth, isAdmin } from "@/lib/auth";
import { loadKycDocument } from "@/lib/services/kyc";
import { guessContentType, normalizeKycObjectKey } from "@/lib/storage/kyc";

export const dynamic = "force-dynamic";

/**
 * Serve KYC uploads to the owning user or admins only.
 * Path: /api/uploads/kyc/{userId}/{file}
 * Backed by Supabase Storage when configured, else local disk.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const session = await getAuth().getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: parts } = await ctx.params;
  const relative = parts.join("/");
  const objectKey = normalizeKycObjectKey(relative);

  // Expect kyc/{userId}/...
  const keyParts = objectKey.split("/");
  const userIdFromPath = keyParts[0] === "kyc" ? keyParts[1] : null;
  const allowed =
    isAdmin(session.user.role) ||
    (userIdFromPath != null && userIdFromPath === session.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const loaded = await loadKycDocument(objectKey);
  if (!loaded) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(loaded.data), {
    headers: {
      "Content-Type": loaded.contentType || guessContentType(objectKey),
      "Cache-Control": "private, max-age=60",
    },
  });
}
