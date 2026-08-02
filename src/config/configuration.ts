import { readFileSync } from 'fs';

/**
 * Strongly-typed application configuration.
 *
 * The whole point of this file is the connection-string assembly below: host and
 * port live in SEPARATE environment variables, so the identical compiled code
 * runs in development (localhost:5440) and in production (the internal service
 * name `postgres:5432`) with no code change — only the env values differ.
 */
export interface AppConfig {
  app: {
    env: string;
    port: number;
    name: string;
  };
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    url: string;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    url: string;
  };
  crypto: {
    aesKeyHex: string;
    searchHashKeyHex: string;
    barcodeHmacSecret: string;
  };
  jwt: {
    privateKey: string;
    publicKey: string;
    accessTtl: string;
    refreshTtl: string;
    issuer: string;
    audience: string;
  };
  features: {
    gateAccessEnforced: boolean;
    gateAccessStrict: boolean;
  };
  cors: {
    // Allowed browser origins. Empty in dev (the Vite proxy makes the app same-origin,
    // so no CORS is needed); set CORS_ORIGINS in prod when the SPA is served from a
    // different origin than the API.
    origins: string[];
  };
}

/**
 * Resolve a PEM key from either an inline env value (with `\n` escaped) or a
 * file path. Inline wins when both are supplied.
 */
function resolveKey(inline?: string, path?: string): string {
  if (inline && inline.trim().length > 0) {
    // Supports keys pasted into a single-line env var ("-----BEGIN...\n...").
    return inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
  }
  if (path && path.trim().length > 0) {
    return readFileSync(path, 'utf8');
  }
  return '';
}

function buildPostgresUrl(p: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): string {
  // Credentials are URL-encoded so special characters in a password are safe.
  const auth = `${encodeURIComponent(p.user)}:${encodeURIComponent(p.password)}`;
  return `postgresql://${auth}@${p.host}:${p.port}/${p.database}`;
}

function buildRedisUrl(r: {
  host: string;
  port: number;
  password: string;
}): string {
  const auth = r.password ? `:${encodeURIComponent(r.password)}@` : '';
  return `redis://${auth}${r.host}:${r.port}`;
}

export default (): AppConfig => {
  const env = process.env;

  const postgres = {
    host: env.POSTGRES_HOST ?? 'localhost',
    port: Number.parseInt(env.POSTGRES_PORT ?? '5432', 10),
    user: env.POSTGRES_USER ?? '',
    password: env.POSTGRES_PASSWORD ?? '',
    database: env.POSTGRES_DB ?? '',
    url: '',
  };
  // An explicit DATABASE_URL always wins; otherwise assemble it from the discrete
  // host/port/credential parts (the dev-vs-prod flexibility lives right here).
  postgres.url =
    env.DATABASE_URL && env.DATABASE_URL.trim().length > 0
      ? env.DATABASE_URL.trim()
      : buildPostgresUrl(postgres);

  const redis = {
    host: env.REDIS_HOST ?? 'localhost',
    port: Number.parseInt(env.REDIS_PORT ?? '6379', 10),
    password: env.REDIS_PASSWORD ?? '',
    url: '',
  };
  redis.url =
    env.REDIS_URL && env.REDIS_URL.trim().length > 0
      ? env.REDIS_URL.trim()
      : buildRedisUrl(redis);

  return {
    app: {
      env: env.NODE_ENV ?? 'development',
      port: Number.parseInt(env.PORT ?? '3000', 10),
      name: env.APP_NAME ?? 'e-SAPS',
    },
    postgres,
    redis,
    crypto: {
      aesKeyHex: env.AES_KEY_HEX ?? '',
      searchHashKeyHex: env.SEARCH_HASH_KEY_HEX ?? '',
      barcodeHmacSecret: env.BARCODE_HMAC_SECRET ?? '',
    },
    jwt: {
      privateKey: resolveKey(env.JWT_PRIVATE_KEY, env.JWT_PRIVATE_KEY_PATH),
      publicKey: resolveKey(env.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY_PATH),
      accessTtl: env.JWT_ACCESS_TTL ?? '12h',
      refreshTtl: env.JWT_REFRESH_TTL ?? '30d',
      issuer: env.JWT_ISSUER ?? 'e-saps',
      audience: env.JWT_AUDIENCE ?? 'e-saps-clients',
    },
    features: {
      // Gate-access enforcement during the scan (Phase 4-b). Dormant by default for a
      // staged rollout; enabled with GATE_ACCESS_ENFORCED=true after visual verification.
      gateAccessEnforced: env.GATE_ACCESS_ENFORCED === 'true',
      // Strict (default-deny) gate policy. Only meaningful when gateAccessEnforced=true.
      // No grant => denied outright. Enable with GATE_ACCESS_STRICT=true AFTER every active
      // employee has an explicit gate assignment (readiness check), else all get denied.
      gateAccessStrict: env.GATE_ACCESS_STRICT === 'true',
    },
    cors: {
      origins: (env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    },
  };
};
