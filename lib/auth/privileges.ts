/**
 * Support staff privilege catalog.
 * Full `admin` role bypasses the matrix (all privileges on).
 * New support staff default to chat.access only.
 */

export const PRIVILEGE_KEYS = [
  "kyc.view",
  "kyc.review",
  "deposits.view",
  "deposits.review",
  "withdrawals.view",
  "withdrawals.review",
  "transfers.view",
  "transfers.review",
  "properties.edit",
  "properties.create",
  "settings.wallets",
  "settings.emails",
  "settings.apy",
  "chat.access",
] as const;

export type PrivilegeKey = (typeof PRIVILEGE_KEYS)[number];

export type PrivilegeMap = Record<PrivilegeKey, boolean>;

export const PRIVILEGE_LABELS: Record<
  PrivilegeKey,
  { label: string; description: string; group: string }
> = {
  "kyc.view": {
    label: "View KYC queue",
    description: "See pending identity verification submissions",
    group: "KYC",
  },
  "kyc.review": {
    label: "Approve / decline KYC",
    description: "Make KYC decisions",
    group: "KYC",
  },
  "deposits.view": {
    label: "View deposits",
    description: "See pending deposit reports",
    group: "Deposits",
  },
  "deposits.review": {
    label: "Confirm / reject deposits",
    description: "Credit or reject deposit reports",
    group: "Deposits",
  },
  "withdrawals.view": {
    label: "View withdrawals",
    description: "See pending and processing withdrawals",
    group: "Withdrawals",
  },
  "withdrawals.review": {
    label: "Approve / decline withdrawals",
    description: "Approve, complete, or reject payouts",
    group: "Withdrawals",
  },
  "transfers.view": {
    label: "View transfers",
    description: "See pending internal balance transfers",
    group: "Transfers",
  },
  "transfers.review": {
    label: "Approve / decline transfers",
    description: "Approve or reject user-to-user balance transfers",
    group: "Transfers",
  },
  "properties.edit": {
    label: "Edit properties",
    description: "Update existing featured properties",
    group: "Properties",
  },
  "properties.create": {
    label: "Create properties",
    description: "Add new featured properties",
    group: "Properties",
  },
  "settings.wallets": {
    label: "Deposit wallets",
    description: "Create/edit deposit wallet addresses",
    group: "Settings",
  },
  "settings.emails": {
    label: "Official emails",
    description: "Create/edit official email addresses",
    group: "Settings",
  },
  "settings.apy": {
    label: "APY rules",
    description: "Edit portfolio APY tiers and lockup multipliers",
    group: "Settings",
  },
  "chat.access": {
    label: "Support chat",
    description: "Access live support inbox and reply to users",
    group: "Chat",
  },
};

/** Review actions imply the matching view capability. */
export const PRIVILEGE_IMPLIES: Partial<
  Record<PrivilegeKey, PrivilegeKey[]>
> = {
  "kyc.review": ["kyc.view"],
  "deposits.review": ["deposits.view"],
  "withdrawals.review": ["withdrawals.view"],
  "transfers.review": ["transfers.view"],
};

export function emptyPrivileges(): PrivilegeMap {
  return Object.fromEntries(
    PRIVILEGE_KEYS.map((k) => [k, false]),
  ) as PrivilegeMap;
}

/** Default for newly created support staff. */
export function defaultSupportPrivileges(): PrivilegeMap {
  const p = emptyPrivileges();
  p["chat.access"] = true;
  return p;
}

export function allPrivilegesOn(): PrivilegeMap {
  return Object.fromEntries(
    PRIVILEGE_KEYS.map((k) => [k, true]),
  ) as PrivilegeMap;
}

export function parsePrivilegesJson(raw: string | null | undefined): PrivilegeMap {
  const base = emptyPrivileges();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of PRIVILEGE_KEYS) {
      if (parsed[key] === true) base[key] = true;
    }
  } catch {
    // ignore corrupt JSON
  }
  return expandImplied(base);
}

export function expandImplied(map: PrivilegeMap): PrivilegeMap {
  const out = { ...map };
  for (const [key, implied] of Object.entries(PRIVILEGE_IMPLIES) as [
    PrivilegeKey,
    PrivilegeKey[],
  ][]) {
    if (out[key]) {
      for (const i of implied) out[i] = true;
    }
  }
  return out;
}

/** Normalize toggles: if review is on, force view on before save. */
export function normalizePrivilegeMap(
  input: Partial<Record<PrivilegeKey, boolean>>,
): PrivilegeMap {
  const base = emptyPrivileges();
  for (const key of PRIVILEGE_KEYS) {
    if (input[key] === true) base[key] = true;
  }
  return expandImplied(base);
}

export function privilegesToJson(map: PrivilegeMap): string {
  const normalized = normalizePrivilegeMap(map);
  return JSON.stringify(normalized);
}

export function isPrivilegeKey(value: string): value is PrivilegeKey {
  return (PRIVILEGE_KEYS as readonly string[]).includes(value);
}

export function hasPrivilegeInMap(
  map: PrivilegeMap,
  key: PrivilegeKey,
): boolean {
  if (map[key]) return true;
  // review implies view already expanded; also allow view if only review stored raw
  const expanded = expandImplied(map);
  return expanded[key] === true;
}

export function hasAnyPrivilegeInMap(
  map: PrivilegeMap,
  keys: PrivilegeKey[],
): boolean {
  return keys.some((k) => hasPrivilegeInMap(map, k));
}

/** Admin nav items → required privilege (null = admin-only). */
export const ADMIN_NAV_PRIVILEGE: Record<
  string,
  PrivilegeKey | PrivilegeKey[] | "admin" | "any-staff"
> = {
  "/admin": "any-staff",
  "/admin/users": "admin",
  "/admin/kyc": "kyc.view",
  "/admin/deposits": "deposits.view",
  "/admin/plans": "admin",
  "/admin/payouts": "withdrawals.view",
  "/admin/transfers": "transfers.view",
  "/admin/properties": ["properties.edit", "properties.create"],
  "/admin/settings": ["settings.wallets", "settings.emails", "settings.apy"],
  "/admin/content": "admin",
  "/admin/audit": "admin",
  "/admin/support": "chat.access",
  "/admin/support-staff": "admin",
};
