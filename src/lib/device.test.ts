import { describe, expect, it } from "vitest";
import { isHandheld } from "./device";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/126.0 Safari/537.36",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36",
};

describe("isHandheld", () => {
  it("is true for phones and tablets", () => {
    expect(isHandheld(UA.iphone, 5)).toBe(true);
    expect(isHandheld(UA.android, 5)).toBe(true);
    expect(isHandheld(UA.androidTablet, 5)).toBe(true);
  });

  it("catches an iPad sending a desktop Mac user-agent", () => {
    expect(isHandheld(UA.ipadOs, 5)).toBe(true);
  });

  it("does not send somebody at a laptop to find a laptop", () => {
    // The touchscreen-laptop case: plenty of touch points, keyboard attached.
    expect(isHandheld(UA.windows, 10)).toBe(false);
    expect(isHandheld(UA.linux, 10)).toBe(false);
    expect(isHandheld(UA.mac, 0)).toBe(false);
  });

  it("leaves a real Mac alone whatever its touch points say", () => {
    expect(isHandheld(UA.mac, 0)).toBe(false);
  });

  it("says desktop when it knows nothing", () => {
    // The quieter wrong answer: no line, rather than a confusing one.
    expect(isHandheld("", 0)).toBe(false);
  });
});
