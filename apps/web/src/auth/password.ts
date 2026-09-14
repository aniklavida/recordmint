import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * Argon2id hashing (SPEC.md §12), MIT-licensed prebuilt native bindings —
 * no build toolchain needed on the machine that runs `pnpm install`. The
 * algorithm is pinned explicitly rather than left at the library default,
 * because "Argon2id" is the actual decision on record, not "whatever
 * Argon2 variant this library ships today."
 *
 * `2` is `@node-rs/argon2`'s own `Algorithm.Argon2id` — a numeric literal
 * here rather than importing that `const enum` because this repository's
 * base tsconfig sets `isolatedModules`, which forbids importing a
 * `const enum`'s members across a module boundary. The library's type
 * definition for `Algorithm` documents the same three values in the same
 * order (Argon2d = 0, Argon2i = 1, Argon2id = 2).
 */
const ARGON2ID_OPTIONS: Options = {
  algorithm: 2,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2ID_OPTIONS);
}

/** Never throws on a wrong password — a mismatch is a normal `false`, not an exception a caller might mishandle into a 500. */
export async function verifyPassword(plaintext: string, hashed: string): Promise<boolean> {
  try {
    return await verify(hashed, plaintext);
  } catch {
    return false;
  }
}
