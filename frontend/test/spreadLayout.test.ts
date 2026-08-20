// The tableau geometry must agree with the engine that deals the cards.
//
// A layout is keyed by index against the position list in
// packages/astra-core/src/tarot.ts. If the two ever disagree in LENGTH, cards
// land in grid areas that do not exist and CSS silently drops them into the
// implicit grid — a Celtic Cross that renders nine cards in the cross and one
// stray below it, with no error anywhere. These tests read the real engine, not
// a copy of it.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SPREAD_POSITIONS } from "../../packages/astra-core/src/tarot";
import { SPREAD_LAYOUTS, layoutFor, gridStyle } from "../src/lib/spreadLayout";

test("every layout has exactly one cell per dealt position", () => {
  for (const [spread, layout] of Object.entries(SPREAD_LAYOUTS)) {
    const positions = SPREAD_POSITIONS[spread];
    assert.ok(positions, `${spread} has a layout but the engine has no positions`);
    assert.equal(
      layout.cells.length, positions.length,
      `${spread}: ${layout.cells.length} cells for ${positions.length} cards`,
    );
  }
});

test("every named cell is placed somewhere in the grid, and every grid slot is filled", () => {
  for (const [spread, layout] of Object.entries(SPREAD_LAYOUTS)) {
    const placed = layout.rows.flatMap((r) => r.split(/\s+/).filter((t) => t && t !== "."));
    assert.deepEqual(
      [...placed].sort(), [...layout.cells].sort(),
      `${spread}: the grid areas and the cell names differ`,
    );
    // A duplicate name would silently merge two cards into one grid area.
    assert.equal(new Set(placed).size, placed.length, `${spread}: duplicate grid area`);
  }
});

test("grid rows are rectangular — a ragged row makes the whole template invalid", () => {
  for (const [spread, layout] of Object.entries(SPREAD_LAYOUTS)) {
    const widths = layout.rows.map((r) => r.split(/\s+/).filter(Boolean).length);
    assert.equal(new Set(widths).size, 1, `${spread}: rows of differing width ${widths}`);
    assert.equal(
      widths[0], layout.columns.split(/\s+/).filter(Boolean).length,
      `${spread}: row width does not match the column count`,
    );
  }
});

test("landscape indices point at real positions", () => {
  for (const [spread, layout] of Object.entries(SPREAD_LAYOUTS)) {
    for (const i of layout.landscape ?? []) {
      assert.ok(
        i >= 0 && i < layout.cells.length,
        `${spread}: landscape index ${i} is out of range`,
      );
    }
  }
});

test("the Celtic Cross crossing card is the one laid across the heart", () => {
  const l = layoutFor("celtic_cross")!;
  assert.equal(l.cells[0], "heart");
  assert.equal(l.cells[1], "crossing");
  assert.deepEqual(l.landscape, [1]);
});

test("spreads with no tableau fall back to the plain row", () => {
  assert.equal(layoutFor("twelve_house"), null);
  assert.equal(layoutFor("three_card"), null);
  assert.equal(layoutFor("nonsense"), null);
});

test("gridStyle emits a quoted row per template row", () => {
  const style = gridStyle(layoutFor("tree_of_life")!);
  const quoted = String(style.gridTemplateAreas).match(/"/g) ?? [];
  assert.equal(quoted.length, 7 * 2);   // seven rows, opened and closed
});
