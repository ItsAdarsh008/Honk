import { describe, expect, it } from "vitest";
import {
  DAY_END,
  DAY_START,
  atLeast,
  emptyWeek,
  freeIntervals,
  intersectIntervals,
  intervalAt,
  isFreeAt,
  mergeIntervals,
  nextSharedGap,
  sharedGaps,
  sharedGapsForWeek,
} from "./intervals";

const at = (h: number, m = 0) => h * 60 + m;

describe("mergeIntervals", () => {
  it("sorts and coalesces overlapping intervals", () => {
    expect(
      mergeIntervals([
        { start: at(10), end: at(11) },
        { start: at(9), end: at(10, 30) },
      ]),
    ).toEqual([{ start: at(9), end: at(11) }]);
  });

  it("joins intervals that merely touch", () => {
    expect(
      mergeIntervals([
        { start: at(9), end: at(10) },
        { start: at(10), end: at(11) },
      ]),
    ).toEqual([{ start: at(9), end: at(11) }]);
  });

  it("keeps disjoint intervals apart", () => {
    const input = [
      { start: at(9), end: at(10) },
      { start: at(13), end: at(14) },
    ];
    expect(mergeIntervals(input)).toEqual(input);
  });

  it("discards zero-length and inverted intervals", () => {
    expect(
      mergeIntervals([
        { start: at(9), end: at(9) },
        { start: at(11), end: at(10) },
      ]),
    ).toEqual([]);
  });
});

describe("freeIntervals", () => {
  it("returns the whole campus day when nothing is booked", () => {
    expect(freeIntervals([])).toEqual([{ start: DAY_START, end: DAY_END }]);
  });

  it("carves a single class out of the day", () => {
    expect(freeIntervals([{ start: at(10), end: at(11) }])).toEqual([
      { start: DAY_START, end: at(10) },
      { start: at(11), end: DAY_END },
    ]);
  });

  it("returns nothing when the whole window is busy", () => {
    expect(freeIntervals([{ start: DAY_START, end: DAY_END }])).toEqual([]);
  });

  it("clamps a class that runs outside campus hours", () => {
    expect(freeIntervals([{ start: at(6), end: at(9) }])).toEqual([
      { start: at(9), end: DAY_END },
    ]);
  });

  it("ignores a class entirely outside campus hours", () => {
    expect(freeIntervals([{ start: at(23), end: at(23, 50) }])).toEqual([
      { start: DAY_START, end: DAY_END },
    ]);
  });

  it("handles back-to-back classes without inventing a zero-length gap", () => {
    expect(
      freeIntervals([
        { start: at(10), end: at(11) },
        { start: at(11), end: at(12) },
      ]),
    ).toEqual([
      { start: DAY_START, end: at(10) },
      { start: at(12), end: DAY_END },
    ]);
  });
});

describe("intersectIntervals", () => {
  it("finds the overlap of two windows", () => {
    expect(
      intersectIntervals(
        [{ start: at(9), end: at(12) }],
        [{ start: at(11), end: at(14) }],
      ),
    ).toEqual([{ start: at(11), end: at(12) }]);
  });

  it("returns nothing when the windows do not touch", () => {
    expect(
      intersectIntervals(
        [{ start: at(9), end: at(10) }],
        [{ start: at(11), end: at(12) }],
      ),
    ).toEqual([]);
  });

  it("handles many-to-many overlaps", () => {
    expect(
      intersectIntervals(
        [
          { start: at(9), end: at(11) },
          { start: at(13), end: at(15) },
        ],
        [
          { start: at(10), end: at(14) },
          { start: at(14, 30), end: at(16) },
        ],
      ),
    ).toEqual([
      { start: at(10), end: at(11) },
      { start: at(13), end: at(14) },
      { start: at(14, 30), end: at(15) },
    ]);
  });
});

describe("sharedGaps", () => {
  it("finds the window where both people are free", () => {
    const a = [
      { start: at(8, 30), end: at(9, 50) },
      { start: at(13), end: at(14, 20) },
    ];
    const b = [
      { start: at(8, 30), end: at(9, 50) },
      { start: at(15, 30), end: at(16, 50) },
    ];
    expect(sharedGaps([a, b])).toEqual([
      { start: DAY_START, end: at(8, 30) },
      { start: at(9, 50), end: at(13) },
      { start: at(14, 20), end: at(15, 30) },
      { start: at(16, 50), end: DAY_END },
    ]);
  });

  it("drops windows shorter than the minimum", () => {
    const a = [
      { start: at(9), end: at(10) },
      { start: at(10, 20), end: at(12) },
    ];
    const b: typeof a = [];
    const gaps = sharedGaps([a, b]);
    expect(gaps.some((g) => g.start === at(10) && g.end === at(10, 20))).toBe(false);
  });

  it("honours a custom minimum", () => {
    const a = [
      { start: at(9), end: at(10) },
      { start: at(10, 20), end: at(12) },
    ];
    const gaps = sharedGaps([a, []], { minMinutes: 15 });
    expect(gaps).toContainEqual({ start: at(10), end: at(10, 20) });
  });

  it("returns nothing when one person is busy all day", () => {
    expect(sharedGaps([[{ start: DAY_START, end: DAY_END }], []])).toEqual([]);
  });

  it("generalises to three people", () => {
    const gaps = sharedGaps([
      [{ start: at(9), end: at(11) }],
      [{ start: at(11), end: at(13) }],
      [{ start: at(14), end: at(16) }],
    ]);
    expect(gaps).toEqual([
      { start: DAY_START, end: at(9) },
      { start: at(13), end: at(14) },
      { start: at(16), end: DAY_END },
    ]);
  });

  it("returns nothing for an empty list of schedules", () => {
    expect(sharedGaps([])).toEqual([]);
  });
});

describe("sharedGapsForWeek", () => {
  it("computes each weekday independently", () => {
    const a = emptyWeek();
    const b = emptyWeek();
    a[1] = [{ start: at(9), end: at(17) }];
    b[2] = [{ start: at(9), end: at(17) }];
    const week = sharedGapsForWeek([a, b]);
    expect(week[1]).toEqual([
      { start: DAY_START, end: at(9) },
      { start: at(17), end: DAY_END },
    ]);
    expect(week[3]).toEqual([{ start: DAY_START, end: DAY_END }]);
  });
});

describe("isFreeAt and intervalAt", () => {
  it("says free between classes", () => {
    expect(isFreeAt([{ start: at(9), end: at(10) }], at(11))).toBe(true);
  });

  it("says busy during a class, inclusive of the start minute", () => {
    expect(isFreeAt([{ start: at(9), end: at(10) }], at(9))).toBe(false);
    expect(isFreeAt([{ start: at(9), end: at(10) }], at(9, 59))).toBe(false);
  });

  it("says free at the exact end of a class", () => {
    expect(isFreeAt([{ start: at(9), end: at(10) }], at(10))).toBe(true);
  });

  it("says not free outside campus hours", () => {
    expect(isFreeAt([], at(6))).toBe(false);
    expect(isFreeAt([], at(22))).toBe(false);
  });

  it("finds the interval containing a minute", () => {
    const intervals = [{ start: at(12), end: at(14) }];
    expect(intervalAt(intervals, at(13))).toEqual({ start: at(12), end: at(14) });
    expect(intervalAt(intervals, at(15))).toBeNull();
  });
});

describe("nextSharedGap", () => {
  it("finds a gap later today", () => {
    const week = emptyWeek();
    week[3] = [{ start: at(14), end: at(16) }];
    expect(nextSharedGap(week, 3, at(10))).toEqual({
      weekday: 3,
      interval: { start: at(14), end: at(16) },
    });
  });

  it("truncates a gap already under way", () => {
    const week = emptyWeek();
    week[3] = [{ start: at(14), end: at(16) }];
    expect(nextSharedGap(week, 3, at(15))).toEqual({
      weekday: 3,
      interval: { start: at(15), end: at(16) },
    });
  });

  it("rolls forward to a later day", () => {
    const week = emptyWeek();
    week[5] = [{ start: at(9), end: at(11) }];
    expect(nextSharedGap(week, 3, at(10))).toEqual({
      weekday: 5,
      interval: { start: at(9), end: at(11) },
    });
  });

  it("wraps around the end of the week", () => {
    const week = emptyWeek();
    week[1] = [{ start: at(9), end: at(11) }];
    expect(nextSharedGap(week, 6, at(10))?.weekday).toBe(1);
  });

  it("returns null when there is no shared gap at all", () => {
    expect(nextSharedGap(emptyWeek(), 1, at(10))).toBeNull();
  });

  it("skips a remaining sliver that is too short to use", () => {
    const week = emptyWeek();
    week[3] = [{ start: at(14), end: at(16) }];
    expect(nextSharedGap(week, 3, at(15, 45))).toBeNull();
  });
});

describe("atLeast", () => {
  it("keeps intervals of exactly the minimum length", () => {
    expect(atLeast([{ start: at(10), end: at(10, 30) }], 30)).toHaveLength(1);
    expect(atLeast([{ start: at(10), end: at(10, 29) }], 30)).toHaveLength(0);
  });
});
