import { test, expect, pastThreshold } from "./helpers";

// One AudioContext across BOTH instruments.
//
// The torus sounds a pair; the field sounds all fourteen. Each used to build
// its own context, which was fine while only one could play and stops being
// fine the moment they are meant to sound together — every failure mode
// counterfeits or destroys the one signal the pairing exists to reveal:
//
//   two limiters   a compressor's gain envelope moving at a few Hz is
//                  indistinguishable from a BEAT at a few Hz, and two of them
//                  in separate contexts cannot see each other
//   two beds       both read the binaural bed from the same persisted spec, so
//                  two is double amplitude AND two carriers drifting into a
//                  beat nobody chose
//   two clocks     ctx.currentTime is per-context, so there is no shared
//                  instant to schedule a crossfade against
//
// lib/audioSession.ts fixes all three by construction, and test/audioSession
// asserts the topology against a fake. This asserts the thing a fake cannot:
// that in a REAL browser, driving the REAL panels, only one context is ever
// built — and that the instrument is actually audible, which is the failure a
// silent bus would produce with every oscillator running and no error anywhere.

/** Count AudioContext constructions from page load onward. */
async function countContexts(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const Real = w.AudioContext as { new (): AudioContext };
    if (!Real) return;
    const built: AudioContext[] = [];
    (w as { __ctxs?: AudioContext[] }).__ctxs = built;
    const Patched = function (this: unknown) {
      const c = new Real();
      built.push(c);
      return c;
    } as unknown as { new (): AudioContext };
    Patched.prototype = Real.prototype;
    w.AudioContext = Patched;
    w.webkitAudioContext = Patched;
  });
}

async function openDepths(page: import("@playwright/test").Page, tab: string) {
  await pastThreshold(page);
  await page.locator('.dial-node[data-ch="V"]').click();
  await expect(page.locator(".arcana-tab").first()).toBeVisible();
  await page.getByRole("button", { name: tab, exact: true }).click();
}

test("the torus and the field share ONE audio context", async ({ page }) => {
  await countContexts(page);
  await openDepths(page, "Torus");

  // Sound the pair.
  await page.getByRole("button", { name: /Sound the pair/i }).click();
  await expect(page.getByRole("button", { name: /Stop sound/i })).toBeVisible();

  const afterTorus = await page.evaluate(
    () => (window as unknown as { __ctxs?: unknown[] }).__ctxs?.length ?? 0,
  );
  expect(afterTorus).toBe(1);

  // The instrument must actually be AUDIBLE. A bus is created silent so the
  // graph can be built unheard; forgetting to open it is the worst kind of
  // failure — every oscillator running, every gain correct, nothing to hear
  // and nothing logged.
  const state = await page.evaluate(
    () => (window as unknown as { __ctxs?: AudioContext[] }).__ctxs?.[0]?.state,
  );
  expect(state).toBe("running");
});

test("switching to the Field tab does not build a second context", async ({ page }) => {
  await countContexts(page);
  await openDepths(page, "Torus");
  await page.getByRole("button", { name: /Sound the pair/i }).click();
  await expect(page.getByRole("button", { name: /Stop sound/i })).toBeVisible();

  await page.getByRole("button", { name: "Field", exact: true }).click();

  // THE WAIT IS THE TEST. Without it this passes for the wrong reason: the
  // torus's teardown is async (a fade, then release), so clicking quickly
  // enough finds the session still alive whether or not anything was fixed.
  // Measured against the unwired version — switch tab, wait, and the context
  // reads `closed`; the field then built a SECOND one. Two contexts is two
  // limiters and two beds, and nothing to crossfade between.
  await page.waitForTimeout(2500);
  expect(
    await page.evaluate(
      () => (window as unknown as { __ctxs?: AudioContext[] }).__ctxs?.[0]?.state,
    ),
  ).toBe("running");

  await page.getByRole("button", { name: /Sound the natal field/i }).click();
  await expect(page.getByRole("button", { name: /Stop the field/i })).toBeVisible();

  // Two contexts here is two limiters and two beds — the state this whole
  // module exists to make unreachable.
  const built = await page.evaluate(
    () => (window as unknown as { __ctxs?: unknown[] }).__ctxs?.length ?? 0,
  );
  expect(built).toBe(1);
});
