import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * A person who can sign in. Password auth only — Argon2id hashing, no
 * third-party identity provider in the critical path, because a
 * self-hosted product that needs a vendor in order to log in is not
 * self-hosted. `passwordHash` is the Argon2id output; this package never
 * hashes or verifies it — that belongs to the feature that owns login.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
