import { describe, expect, it } from "vitest";
import { sharedClassNote } from "./shared-class";

const of = (...codes: string[]) => codes.map((code) => ({ code }));

describe("sharedClassNote", () => {
  it("says nothing when there is nothing to say", () => {
    expect(sharedClassNote([])).toBeNull();
  });

  it("names one class", () => {
    expect(sharedClassNote(of("ECON 120"))).toBe("In your ECON 120");
  });

  it("counts a course once however many of its sections are shared", () => {
    // The lecture and the tutorial of one course are one class with you.
    expect(sharedClassNote(of("ECON 120", "ECON 120"))).toBe("In your ECON 120");
  });

  it("names two, and counts the rest", () => {
    expect(sharedClassNote(of("ECON 120", "BUS 111"))).toBe("In your ECON 120 and BUS 111");
    expect(sharedClassNote(of("ECON 120", "BUS 111", "CS 135"))).toBe(
      "In your ECON 120, BUS 111 and 1 more",
    );
    expect(sharedClassNote(of("ECON 120", "BUS 111", "CS 135", "MATH 137"))).toBe(
      "In your ECON 120, BUS 111 and 2 more",
    );
  });

  it("counts the rest after deduplicating, not before", () => {
    expect(sharedClassNote(of("ECON 120", "ECON 120", "BUS 111", "BUS 111"))).toBe(
      "In your ECON 120 and BUS 111",
    );
  });

  it("holds up with a Laurier subject spelled out", () => {
    expect(sharedClassNote(of("DATA SCIENCE 100"))).toBe("In your DATA SCIENCE 100");
  });
});
