// dailyNotifications — the planning half, which is where the bugs would be.
//
// The scheduling call itself is a thin pass to the plugin; what is worth
// pinning is the plan it is handed. Two failures here are the kind a reader
// experiences as the app being broken rather than as a missing feature: a
// notification that fires the instant they switch it on, and duplicates that
// pile up every time the app launches.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_PREFS,
  normalisePrefs,
  planDailyNotifications,
} from "../src/lib/dailyNotifications";
import { precomputeDailyDraws } from "../src/lib/dailyOracle";
import { localChartFixture } from "./fixtures/chart";

const chart = localChartFixture();
const at8am = { enabled: true, hour: 8, minute: 0 };

test("enabling it after today's time has passed does not fire immediately", () => {
  // The bug this prevents: Android delivers a past-dated local notification as
  // soon as it is scheduled. Switching the feature on at 10am with an 8am
  // preference would push today's card into the shade instantly — which reads
  // as a glitch, and shows a card they may already have turned.
  const now = new Date(2026, 7, 12, 10, 30);
  const draws = precomputeDailyDraws(chart, 5, now);
  const plan = planDailyNotifications(draws, at8am, now);

  assert.equal(plan[0].extra.date, "2026-08-13", "today's past slot was scheduled");
  for (const p of plan) {
    assert.ok(p.at.getTime() > now.getTime(), `scheduled in the past: ${p.at.toISOString()}`);
  }
});

test("enabling it before today's time still gets today's card", () => {
  const now = new Date(2026, 7, 12, 6, 15);
  const draws = precomputeDailyDraws(chart, 5, now);
  const plan = planDailyNotifications(draws, at8am, now);
  assert.equal(plan[0].extra.date, "2026-08-12");
  assert.equal(plan[0].at.getHours(), 8);
  assert.equal(plan[0].at.getMinutes(), 0);
});

test("ids are stable per day offset, so re-planning overwrites rather than piles up", () => {
  const now = new Date(2026, 7, 12, 6, 0);
  const a = planDailyNotifications(precomputeDailyDraws(chart, 10, now), at8am, now);
  const b = planDailyNotifications(precomputeDailyDraws(chart, 10, now), at8am, now);
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.equal(new Set(a.map((p) => p.id)).size, a.length, "duplicate ids within one plan");
});

test("the notification says which card, and the body is the card's line", () => {
  const now = new Date(2026, 7, 12, 6, 0);
  const draws = precomputeDailyDraws(chart, 3, now);
  const plan = planDailyNotifications(draws, at8am, now);
  for (let i = 0; i < plan.length; i++) {
    assert.ok(plan[i].title.includes(draws[i].title), "title omits the card");
    assert.equal(plan[i].body, draws[i].line);
    assert.equal(plan[i].extra.cardId, draws[i].cardId);
  }
});

test("the chosen time is honoured, not just the default", () => {
  const now = new Date(2026, 7, 12, 6, 0);
  const prefs = { enabled: true, hour: 21, minute: 45 };
  const plan = planDailyNotifications(precomputeDailyDraws(chart, 3, now), prefs, now);
  for (const p of plan) {
    assert.equal(p.at.getHours(), 21);
    assert.equal(p.at.getMinutes(), 45);
  }
});

test("a run crossing a DST boundary keeps firing at the chosen wall-clock time", () => {
  // Scheduling by wall clock is the intent: 8am should stay 8am through a
  // transition, not drift to 7 or 9 because the underlying instants shifted.
  const now = new Date(2026, 2, 6, 6, 0); // days before US spring-forward
  const plan = planDailyNotifications(precomputeDailyDraws(chart, 10, now), at8am, now);
  for (const p of plan) {
    assert.equal(p.at.getHours(), 8, `wall-clock hour drifted on ${p.extra.date}`);
  }
});

test("preferences from storage are clamped, not trusted", () => {
  // localStorage is user-writable and survives version changes. An hour of 25
  // would be silently normalised by the Date constructor into the NEXT DAY.
  assert.equal(normalisePrefs({ enabled: true, hour: 25, minute: 0 }).hour, DEFAULT_PREFS.hour);
  assert.equal(normalisePrefs({ enabled: true, hour: -3, minute: 0 }).hour, DEFAULT_PREFS.hour);
  assert.equal(normalisePrefs({ enabled: true, hour: 8, minute: 99 }).minute, DEFAULT_PREFS.minute);
  assert.equal(normalisePrefs({ enabled: true, hour: NaN, minute: 0 }).hour, DEFAULT_PREFS.hour);
  assert.equal(normalisePrefs(null).enabled, false, "absent prefs must not mean enabled");
  assert.equal(
    normalisePrefs({ enabled: "yes" } as never).enabled,
    false,
    "only a real boolean true enables notifications"
  );
});

test("a clamped hour still produces a valid future schedule", () => {
  const now = new Date(2026, 7, 12, 6, 0);
  const prefs = normalisePrefs({ enabled: true, hour: 25, minute: 0 });
  const plan = planDailyNotifications(precomputeDailyDraws(chart, 3, now), prefs, now);
  assert.ok(plan.length > 0);
  for (const p of plan) assert.ok(p.at.getTime() > now.getTime());
});
