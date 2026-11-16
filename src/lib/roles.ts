/** Roles that can open /admin. Both must use two-step verification there (see requireAdmin in src/lib/auth.ts). */
export const STAFF_ROLES = ["admin", "moderator"] as const;

export const isStaffRole = (roles: readonly string[]) => roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
