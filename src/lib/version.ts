// Sayt versiyasi (package.json) va Vercel deploy qilgan commit: admin va /api/health da ko'rinadi.
import pkg from "../../package.json" with { type: "json" };

export const APP_VERSION: string = pkg.version;
export const APP_COMMIT: string | null = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
