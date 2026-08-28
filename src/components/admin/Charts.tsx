/**
 * Two charts and a stat tile, in plain SVG.
 *
 * Both charts are **single-series**, which settles most of the design
 * questions before they are asked: no legend (the title names the series), no
 * categorical palette to validate, and colour carrying no identity — the
 * category is on the axis where it can be read.
 *
 * The one hue is the app's clay. On the student-facing feed the accent is
 * reserved for time pressure; this is an internal page with no feed and no
 * competing signal, so using it as the data mark costs nothing and keeps the
 * dashboard inside the same visual language as everything else.
 *
 * Numbers are direct-labelled rather than left to an axis, since the whole
 * point of the page is the count. Every mark carries a `<title>`, which is the
 * hover layer.
 */

const SERIES = "#c97b4a";

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="card p-4">
      <p className="section-label">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      {detail && <p className="mt-1.5 text-[13px] text-[var(--ink-soft)]">{detail}</p>}
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Drawn as a second, recessive bar behind the first. */
  secondary?: number;
  note?: string;
}

/**
 * Users per university.
 *
 * Horizontal because the labels are university names — rotated text on a
 * vertical axis is the most common way a bar chart becomes unreadable, and
 * these labels are the identity of every row.
 */
export function BarChart({
  data,
  secondaryLabel,
}: {
  data: BarDatum[];
  secondaryLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        const secondaryPct = d.secondary === undefined ? null : (d.secondary / max) * 100;
        return (
          <div key={d.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px]">
                  {d.label}
                  {d.note && (
                    <span className="mono ml-1.5 text-[11px] text-[var(--ink-faint)]">{d.note}</span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-[10px] w-full overflow-hidden rounded-[4px] bg-[var(--surface-sunken)]">
                {/* The fill is the count; the darker inset is how many of them
                    actually pasted a schedule. Two facts, one row, no legend
                    needed because the second is always a subset of the first. */}
                <div
                  className="relative h-full rounded-[4px]"
                  style={{ width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, background: `${SERIES}55` }}
                  title={`${d.label}: ${d.value}`}
                >
                  {secondaryPct !== null && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-[4px]"
                      style={{
                        width: `${max === 0 ? 0 : (d.secondary! / d.value || 0) * 100}%`,
                        background: SERIES,
                      }}
                      title={`${d.label}: ${d.secondary} ${secondaryLabel ?? ""}`}
                    />
                  )}
                </div>
              </div>
            </div>
            <span className="mono shrink-0 text-right text-[13px] tabular-nums">
              {d.value}
              {d.secondary !== undefined && (
                <span className="text-[var(--ink-faint)]"> / {d.secondary}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Signups per day.
 *
 * A column chart rather than a line: these are counts of discrete events on
 * discrete days, and a line between them implies a continuous quantity that
 * was never measured. Most days are zero and it should look like it.
 */
export function DayChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-[14px] text-[var(--ink-soft)]">
        No signups in the last {data.length} days.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-[90px] items-end gap-[3px]">
        {data.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-t-[3px]"
            style={{
              height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 1)}%`,
              background: d.count > 0 ? SERIES : "var(--border)",
            }}
            title={`${d.date}: ${d.count} ${d.count === 1 ? "signup" : "signups"}`}
          />
        ))}
      </div>
      <div className="mono mt-2 flex justify-between text-[11px] text-[var(--ink-faint)]">
        <span>{data[0]?.date}</span>
        <span>
          {total} in {data.length} days
        </span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
