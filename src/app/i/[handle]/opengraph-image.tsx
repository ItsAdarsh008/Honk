import { ImageResponse } from "next/og";
import { GooseMark } from "@/components/GooseMark";
import { GOOSE_LIGHT } from "@/lib/goose";
import { getInviterName } from "@/lib/invite";
import { liveSchoolCount } from "@/lib/schools";

/**
 * The link preview for one person's invite.
 *
 * The root `opengraph-image` is what every link rendered as, invite links
 * included — so the thing Honk actually spreads through, a link sent by
 * somebody you know, arrived looking like an advert from a company. This is
 * the same card with the one fact that makes it worth opening: a name you
 * recognise, on it.
 *
 * A route segment's own `opengraph-image` is what Next serves for that
 * segment, so this file is the whole fix; `generateMetadata` next door no
 * longer has to say anything about images.
 *
 * The name is read through `lib/invite.ts`, which returns a display name and
 * only for a discoverable user — the same fence the invite page itself stands
 * behind, and asserted in `privacy-boundary.test.ts`. An unknown or hidden
 * handle simply falls back to the unnamed wording rather than leaking the
 * difference between "no such person" and "someone who would rather not say".
 */

export const alt = "You've been invited to Honk";
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

/**
 * A first name, and never more than one line of it.
 *
 * The card has room for about sixteen characters at this size before the
 * headline wraps into the week beside it. Somebody with a long legal name in
 * their profile should still get a card that reads, so this takes the first
 * word and cuts it if even that is too long.
 */
function shortName(name: string | null): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  return first.length > 16 ? `${first.slice(0, 15)}…` : first;
}

export default async function InviteOpengraphImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const name = shortName(await getInviterName(handle));

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
            {name ? (
              <>
                <span>{name} is on Honk.</span>
                <span>See what you share.</span>
              </>
            ) : (
              <>
                <span>You&rsquo;ve been</span>
                <span>invited to Honk.</span>
              </>
            )}
          </div>

          <span style={{ marginTop: 28, fontSize: 27, color: "#75726A" }}>
            Paste your schedule · {liveSchoolCount()} Canadian universities
          </span>
        </div>

        {/* The same week the front page shows, abstracted. */}
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
