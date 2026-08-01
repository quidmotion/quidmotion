import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAuth, isAdmin } from "@/lib/auth";
import { resolveUploadPath } from "@/lib/services/kyc";

export const dynamic = "force-dynamic";

/**
 * Serve KYC uploads to the owning user or admins only.
 * Path: /api/uploads/kyc/{userId}/{file}
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
  const full = resolveUploadPath(relative);
  if (!full) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Expect kyc/{userId}/...
  const userIdFromPath = parts[0] === "kyc" ? parts[1] : null;
  const allowed =
    isAdmin(session.user.role) ||
    (userIdFromPath != null && userIdFromPath === session.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".gif": "image/gif",
  };
  return new NextResponse(data, {
    headers: {
      "Content-Type": types[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=60",
    },
  });
}
