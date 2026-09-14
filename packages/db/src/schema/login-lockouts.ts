import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Tracks repeated failed logins per **email**, not per account. Login
 * already answers "wrong password" and "no such account" identically
 * (../../apps/web/src/features/workspace/application/login.ts) to avoid
 * being an enumeration oracle; keying lockout by account instead of the
 * attempted email would reopen exactly that hole, because only real
 * accounts would ever show a locked response. A row here carries no
 * password material and is not itself a secret.
 *
 * `lockedUntil` is a fixed point in time set once, when `failedCount`
 * crosses the policy threshold — a further failed attempt made *while
 * already locked* never pushes it later (enforced in
 * `../queries/auth.ts`'s `recordFailedLogin`). That is what stops this
 * table from being usable to lock a victim out forever: the lock always
 * expires a fixed window after the attempt that tripped it, no matter how
 * many more attempts an attacker makes in the meantime.
 */
export const loginLockouts = pgTable("login_lockouts", {
  email: text("email").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  firstFailedAt: timestamp("first_failed_at", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
