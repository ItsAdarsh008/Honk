/**
 * The rule about which pastes are worth keeping.
 *
 * Written against the roster rather than against named schools: the test picks
 * whichever school is currently in beta and whichever has graduated, so taking
 * a school out of beta changes the app's behaviour without breaking a test that
 * was only ever asserting the rule.
 */

import { describe, expect, it } from "vitest";
import { pasteOutcome, shouldRecordPaste } from "./samples";
import { LIVE_SCHOOLS } from "../schools";

const beta = LIVE_SCHOOLS.find((s) => s.beta);
const graduated = LIVE_SCHOOLS.find((s) => !s.beta);

describe("pasteOutcome", () => {
  it("calls a paste that produced nothing a failure", () => {
    expect(pasteOutcome(0, 0)).toBe("no_courses");
  });

  it("calls a paste that read something but warned a failure too", () => {
    // The quiet one: the screen looks fine and a class may still be missing.
    expect(pasteOutcome(4, 2)).toBe("warnings");
  });

  it("keeps nothing when the read was clean", () => {
    expect(pasteOutcome(4, 0)).toBeNull();
  });

  it("treats a negative count as nothing read", () => {
    expect(pasteOutcome(-1, 0)).toBe("no_courses");
  });
});

describe("shouldRecordPaste", () => {
  it("keeps a failure from a school still in beta", () => {
    expect(beta, "no school is in beta").toBeDefined();
    expect(shouldRecordPaste(beta!.id, 0, 0)).toBe(true);
    expect(shouldRecordPaste(beta!.id, 3, 1)).toBe(true);
  });

  it("keeps nothing from a school that is out of beta", () => {
    expect(graduated, "every school is in beta").toBeDefined();
    // Its parser was built from a real paste already; another teaches nothing.
    expect(shouldRecordPaste(graduated!.id, 0, 0)).toBe(false);
  });

  it("keeps nothing when the paste read cleanly", () => {
    expect(shouldRecordPaste(beta!.id, 5, 0)).toBe(false);
  });

  it("fails closed on a school it does not recognise", () => {
    // An unknown id resolves to the default school, which is out of beta.
    expect(shouldRecordPaste("not-a-school", 0, 0)).toBe(false);
    expect(shouldRecordPaste("", 0, 0)).toBe(false);
  });
});
