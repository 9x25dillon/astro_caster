// Client error telemetry (R6): uncaught errors post a trimmed client_error
// feature event — deduped per session, message capped, source reduced to
// file:line:col.
import { expect, test } from "./helpers";

test("uncaught errors post trimmed, deduped client_error telemetry", async ({ page }) => {
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  await page.route("**/api/telemetry/event", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/");
  await page.evaluate(() => {
    const fire = () =>
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "boom ".repeat(100),
          filename: "http://localhost:5173/assets/chunk-abc.js?v=1",
          lineno: 3,
          colno: 7,
        })
      );
    fire();
    fire(); // identical → deduped
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.reject().catch(() => undefined) as unknown as Promise<unknown>,
        reason: new TypeError("lost the thread"),
      })
    );
  });

  await expect
    .poll(() => events.filter((e) => e?.name === "client_error").length)
    .toBe(2);

  const errs = events.filter((e) => e.name === "client_error");
  const winErr = errs.find((e) => e.props.kind === "error")!;
  expect((winErr.props.message as string).length).toBeLessThanOrEqual(200);
  expect(winErr.props.source).toBe("chunk-abc.js:3:7");

  const rej = errs.find((e) => e.props.kind === "unhandledrejection")!;
  expect(rej.props.message).toBe("TypeError: lost the thread");
});
