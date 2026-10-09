import { runCycle } from "./runner.ts";
import { nextRunDelay } from "../schedule.ts";


export function startScheduler() {
  if (process.env.ROBOT_SELF_SCHEDULE !== "1") return;
  const minutes = Number(process.env.ROBOT_INTERVAL_MIN ?? 5);
  let running = false;
  const tick = async () => {
    if (!running) {
      running = true;
      try {
        await runCycle("server");
      } catch (e) {
        console.error("robot", e);
      } finally {
        running = false;
      }
    }
    setTimeout(tick, nextRunDelay(Date.now(), minutes));
  };
  setTimeout(tick, 10_000);
}
