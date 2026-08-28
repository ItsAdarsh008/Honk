import { ImageResponse } from "next/og";
import { GooseMark } from "@/components/GooseMark";
import { GOOSE_LIGHT } from "@/lib/goose";
import { liveSchoolList } from "@/lib/schools";

/**
 * The link preview. This is how Honk actually spreads — pasted into iMessage
 * and Instagram DMs — so it gets the same restraint as the app: cream ground,
 * the goose in clay, pastel blocks standing in for a week.
 */

export const alt = "Honk — paste your class schedule, see who's in your classes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BLOCKS = [
  { day: 0, top: 40, height: 92, color: "#B5CDAA" },
  { day: 0, top: 196, height: 68, color: "#AFC8DE" },
  { day: 1, top: 92, height: 120, color: "#F3CBA5" },
  { day: 2, top: 40, height: 68, color: "#B5CDAA" },
  { day: 2, top: 156, height: 108, color: "#DCBBD1" },
  { day: 3, top: 116, height: 92, color: "#EDDDA4" },
  { day: 4, top: 40, height: 92, color: "#B5CDAA" },
  { day: 4, top: 172, height: 76, color: "#C7BADD" },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#FDFBF6",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 34 }}>
            <GooseMark size={48} palette={GOOSE_LIGHT} />
            <span style={{ fontSize: 34, fontWeight: 600, color: "#33322C", letterSpacing: -1 }}>
              Honk
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 62,
              fontWeight: 600,
              color: "#33322C",
              lineHeight: 1.1,
              letterSpacing: -2,
            }}
          >
            <span>Paste your schedule.</span>
            <span>See who else is in it.</span>
          </div>

          {/*
            This card is the most-shared thing Honk has — it is what every
            invite link renders as. Naming one university on it told four
            fifths of the people receiving one that the app was not for them.
          */}
          <span style={{ marginTop: 28, fontSize: 27, color: "#75726A" }}>
            {liveSchoolList()}
          </span>
        </div>

        {/* A week, abstracted. */}
        <div
          style={{
            display: "flex",
            width: 400,
            background: "#FFFFFF",
            border: "1px solid #EAE5DA",
            borderRadius: 22,
            padding: 18,
            gap: 8,
          }}
        >
          {[0, 1, 2, 3, 4].map((day) => (
            <div key={day} style={{ display: "flex", position: "relative", flex: 1 }}>
              {BLOCKS.filter((b) => b.day === day).map((block) => (
                <div
                  key={block.top}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: block.top,
                    height: block.height,
                    background: block.color,
                    borderRadius: 10,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
