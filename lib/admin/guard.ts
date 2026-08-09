import "server-only";
import { redirect } from "next/navigation";
import { getAuth, isAdmin, isStaff } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth/types";
import type { PrivilegeKey, PrivilegeMap } from "@/lib/auth/privileges";
import {
  actorHasAnyPrivilege,
  actorHasPrivilege,
  loadPrivileges,
} from "@/lib/services/_authz";
import { canAccessAdminPath } from "./nav";

export type StaffContext = {
  user: AuthUser;
  privileges: PrivilegeMap;
  isFullAdmin: boolean;
};

export async function requireStaffContext(): Promise<StaffContext> {
  const session = await getAuth().getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.user.status === "suspended") redirect("/login?error=suspended");
  if (!isStaff(session.user.role)) redirect("/dashboard");

  const privileges = await loadPrivileges(session.user);
  if (
    !isAdmin(session.user.role) &&
    !Object.values(privileges).some(Boolean)
  ) {
    redirect("/dashboard");
  }

  return {
    user: session.user,
    privileges,
    isFullAdmin: isAdmin(session.user.role),
  };
}

/** Redirect if staff lacks access to this admin path. */
export async function requireAdminPath(href: string): Promise<StaffContext> {
  const ctx = await requireStaffContext();
  if (!canAccessAdminPath(ctx.user.role, ctx.privileges, href)) {
    redirect("/admin");
  }
  return ctx;
}

export async function requireFullAdmin(): Promise<StaffContext> {
  const ctx = await requireStaffContext();
  if (!ctx.isFullAdmin) redirect("/admin");
  return ctx;
}

export async function staffHasPrivilege(
  ctx: StaffContext,
  key: PrivilegeKey,
): Promise<boolean> {
  if (ctx.isFullAdmin) return true;
  return actorHasPrivilege(ctx.user, key);
}

export async function staffHasAnyPrivilege(
  ctx: StaffContext,
  keys: PrivilegeKey[],
): Promise<boolean> {
  if (ctx.isFullAdmin) return true;
  return actorHasAnyPrivilege(ctx.user, keys);
}
