import { siteConfig } from "@/lib/config/site";
import {
  ADMIN_NAV_PRIVILEGE,
  hasAnyPrivilegeInMap,
  hasPrivilegeInMap,
  type PrivilegeKey,
  type PrivilegeMap,
} from "@/lib/auth/privileges";
import type { Role } from "@/lib/auth/types";
import { isAdmin } from "@/lib/auth/types";

export type AdminNavItem = {
  label: string;
  href: string;
};

export function allAdminNavItems(): AdminNavItem[] {
  return [...siteConfig.adminNav] as AdminNavItem[];
}

export function canAccessAdminPath(
  role: Role,
  privileges: PrivilegeMap,
  href: string,
): boolean {
  if (isAdmin(role)) return true;
  if (role !== "support") return false;

  const req = ADMIN_NAV_PRIVILEGE[href];
  if (!req) {
    return Object.values(privileges).some(Boolean);
  }
  if (req === "admin") return false;
  if (req === "any-staff") return Object.values(privileges).some(Boolean);
  if (Array.isArray(req)) return hasAnyPrivilegeInMap(privileges, req);
  return hasPrivilegeInMap(privileges, req as PrivilegeKey);
}

export function filterAdminNav(
  role: Role,
  privileges: PrivilegeMap,
): AdminNavItem[] {
  return allAdminNavItems().filter((item) =>
    canAccessAdminPath(role, privileges, item.href),
  );
}
