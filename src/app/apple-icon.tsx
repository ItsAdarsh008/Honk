import { ImageResponse } from "next/og";
import { GOOSE_CLAY, GOOSE_CREAM, GOOSE_PATH, GOOSE_VIEWBOX } from "@/lib/goose";

/** Home-screen icon. iOS masks the corners itself, so the ground is a full bleed. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GOOSE_CREAM,
        }}
      >
        <svg width="126" height="126" viewBox={GOOSE_VIEWBOX} fill="none">
          <path fillRule="evenodd" clipRule="evenodd" d={GOOSE_PATH} fill={GOOSE_CLAY} />
        </svg>
      </div>
    ),
    size,
  );
}
