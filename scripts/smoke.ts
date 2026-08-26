/**
 * Post-deploy smoke test.
 *
 *   npx vite-node scripts/smoke.ts https://your-honk-url
 *
 * Checks everything about a deployment that can be checked without signing in,
 * including the privacy behaviour that must hold for a signed-out stranger.
 * Exits non-zero if anything fails, so it can gate a deploy in CI.
 *
 * What it deliberately cannot check is listed at the end of the run: anything
 * needing a real inbox or two real accounts.
 */

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!base) {
  console.error("usage: vite-node scripts/smoke.ts <url>");
  process.exit(2);
}

type Result = { ok: boolean; name: string; detail: string };
const results: Result[] = [];
const notes: string[] = [];

function record(ok: boolean, name: string, detail = "") {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function get(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init });
}

async function main() {
  console.log(`\nsmoke test against ${base}\n`);

  // ---- pages a stranger can reach -------------------------------------
  const home = await get("/");
  const homeHtml = await home.text();
  record(home.status === 200, "landing page loads", `${home.status}`);
  record(
    homeHtml.includes('id="quest-paste"'),
    "paste box renders with no account",
    "the one path that must work for a stranger",
  );

  for (const [path, expect] of [
    ["/signin", 200],
    ["/paste", 200],
    ["/i/someone", 200],
  ] as const) {
    const r = await get(path);
    record(r.status === expect, `${path} responds`, `${r.status}`);
  }

  // An invite must land on the paste screen, not a signup wall.
  const invite = await get("/i/someone");
  const inviteHtml = await invite.text();
  record(
    inviteHtml.includes('id="quest-paste"'),
    "invite link lands on the paste screen",
    "not a signup wall",
  );

  // ---- pages that must NOT be reachable signed out ---------------------
  for (const path of ["/home", "/settings"] as const) {
    const r = await get(path);
    const redirected = r.status === 307 || r.status === 302;
    const target = r.headers.get("location") ?? "";
    record(
      redirected && target.includes("/signin"),
      `${path} redirects a signed-out visitor`,
      `${r.status} → ${target || "(none)"}`,
    );
  }

  // ---- icons and link preview -----------------------------------------
  for (const [path, type] of [
    ["/icon.svg", "image/svg"],
    ["/apple-icon", "image/png"],
    ["/opengraph-image", "image/png"],
  ] as const) {
    const r = await get(path);
    const ct = r.headers.get("content-type") ?? "";
    record(r.status === 200 && ct.includes(type), `${path} serves`, `${r.status} ${ct}`);
  }

  const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(homeHtml)?.[1] ?? "";
  record(Boolean(ogImage), "og:image tag present", ogImage || "missing");
  record(
    ogImage.startsWith("http"),
    "og:image is an absolute URL",
    "relative URLs do not render in iMessage",
  );
  if (ogImage && !ogImage.startsWith(base)) {
    notes.push(
      `og:image points at ${new URL(ogImage).origin}, not ${base}. Set NEXT_PUBLIC_SITE_URL to the real domain and redeploy.`,
    );
  }

  record(
    homeHtml.includes("adarshthoduvakkal.com"),
    "footer credit link present",
  );

  // ---- the Waterloo gate ----------------------------------------------
  const json = { "content-type": "application/json" };
  const outsider = await get("/api/auth/request-code", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: "someone@gmail.com" }),
  });
  record(outsider.status === 400, "non-Waterloo email is refused", `${outsider.status}`);

  const lookalike = await get("/api/auth/request-code", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: "a@uwaterloo.ca.evil.com" }),
  });
  record(lookalike.status === 400, "lookalike domain is refused", `${lookalike.status}`);

  const insider = await get("/api/auth/request-code", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: "smoketest@uwaterloo.ca" }),
  });
  const dbWired = insider.status !== 503;
  record(
    insider.status === 200 || insider.status === 429 || insider.status === 503,
    "Waterloo email is accepted",
    `${insider.status}${insider.status === 503 ? " (no database configured)" : ""}`,
  );

  // ---- nothing sensitive without a session ----------------------------
  for (const [name, path, init] of [
    ["classmates", "/api/classmates?sectionId=1", {}],
    [
      "friends",
      "/api/friends",
      { method: "POST", headers: json, body: JSON.stringify({ action: "request", userId: "x" }) },
    ],
    ["schedule save", "/api/schedule", { method: "POST", headers: json, body: "{}" }],
  ] as const) {
    const r = await get(path, init as RequestInit);
    const refused = r.status === 401 || r.status === 503;
    record(refused, `${name} refuses an unauthenticated caller`, `${r.status}`);
  }

  // A stranger's HTML must carry no room numbers or meeting times.
  //
  // The paste box's placeholder is a hand-written example containing a room,
  // so it is stripped first — otherwise this check fails on its own sample
  // data and stops meaning anything.
  const withoutExamples = homeHtml.replace(/placeholder="[^"]*"/g, "");
  const roomLike = /\b(?:MC|RCH|DWE|STC|PAS|E7|QNC|AL|HH|BA|PHY)\s+\d{3,4}\b/.exec(
    withoutExamples,
  );
  record(
    roomLike === null,
    "no room numbers in signed-out HTML",
    roomLike ? `found "${roomLike[0]}"` : "",
  );

  // ---- summary ---------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);

  if (notes.length) {
    console.log("\nnotes:");
    for (const n of notes) console.log(`  - ${n}`);
  }

  console.log("\nnot checked here — these need a human:");
  console.log("  - a sign-in code actually arriving in a real inbox (Resend domain verification)");
  console.log("  - two accounts seeing each other only after both opt in and both accept");
  console.log("  - a block being mutual and silent");
  console.log("  - the link preview rendering in iMessage or Instagram");
  if (!dbWired) {
    console.log("\n  DATABASE_URL is not configured on this deployment, so accounts,");
    console.log("  saving and every signed-in screen are switched off.");
  }

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("\nsmoke test could not run:", err instanceof Error ? err.message : err);
  process.exit(2);
});
