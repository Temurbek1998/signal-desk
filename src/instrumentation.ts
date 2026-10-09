// O'z serveringizda (VPS, `npm start`) robot 24 soat o'zi ishlashi uchun: ROBOT_SELF_SCHEDULE=1.
// Vercel kabi serverless hostingda buning o'rniga /api/cron tashqi cron bilan chaqiriladi.
export async function register() {
  // Shu shakl Next'ga edge muhitida server kodini yig'maslikni bildiradi.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/server/scheduler.ts");
    startScheduler();
  }
}
