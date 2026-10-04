// Runs once when the Next.js server starts: check the API key early and say so in the terminal.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getKeyStatus } = await import("./server/runtime");
  const status = await getKeyStatus();
  if (!status.ok) console.error(`\n[council] API key check failed: ${status.error}\n`);
  else console.log(status.fake ? "[council] Offline fake mode (COUNCIL_FAKE=1): no API calls." : "[council] API key OK.");
}
