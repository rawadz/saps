import * as argon2 from 'argon2';

/**
 * Shared Argon2id parameters. memoryCost is in KiB. Aim for ~250-500ms per hash
 * on the target hardware; raise over time as hardware improves.
 *
 * Kept framework-free so the Prisma seed can hash the initial passwords with
 * exactly the same parameters the running app uses, without importing NestJS.
 */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};
