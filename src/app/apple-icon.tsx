import { ImageResponse } from "next/og";
import { GooseMark } from "@/components/GooseMark";
import { GOOSE_CREAM, GOOSE_LIGHT } from "@/lib/goose";

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
        <GooseMark size={132} palette={GOOSE_LIGHT} />
      </div>
    ),
    size,
  );
}
