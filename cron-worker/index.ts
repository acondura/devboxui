export default {
  async scheduled(event: ScheduledEvent, env: { CRON_SECRET: string }, ctx: ExecutionContext) {
    const DOMAIN = "https://devboxui.com";
    const headers = {
      "Authorization": `Bearer ${env.CRON_SECRET}`
    };

    console.log(`[Cron Scheduler] Fired schedule trigger at UTC ${new Date().toISOString()}`);

    // Trigger morning workflow
    ctx.waitUntil(
      fetch(`${DOMAIN}/api/schedule/morning`, { headers })
        .then(async (r) => {
          const text = await r.text();
          console.log(`[Cron Scheduler] Morning response (${r.status}):`, text);
        })
        .catch((err) => {
          console.error("[Cron Scheduler] Morning request failed:", err);
        })
    );

    // Trigger evening workflow
    ctx.waitUntil(
      fetch(`${DOMAIN}/api/schedule/evening`, { headers })
        .then(async (r) => {
          const text = await r.text();
          console.log(`[Cron Scheduler] Evening response (${r.status}):`, text);
        })
        .catch((err) => {
          console.error("[Cron Scheduler] Evening request failed:", err);
        })
    );
  }
};
