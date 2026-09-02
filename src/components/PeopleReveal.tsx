"use client";

/**
 * The friend count, and the list it opens.
 *
 * These are two pieces of one control that sit far apart on the page — the
 * count rides in the invite card at the top, the list is a section further
 * down — so the state that joins them lives in a context rather than being
 * threaded through the server component between them. It is a boolean; a
 * context is the cheapest thing that can carry it across that distance.
 *
 * **Why the list collapses at all.** Past a handful of people it stops being
 * something you read and becomes something you scroll past to reach the week,
 * which is the part of this page that changes what somebody does next. Three
 * is the line: a list of three is a glance, a list of nine is a page.
 *
 * Requests are never collapsed. Somebody waiting on an answer is the one thing
 * here with a deadline attached, and hiding it behind a press would be a way
 * of losing friends rather than adding them.
 */

import { createContext, useCallback, useContext, useId, useRef, useState } from "react";

/** Above this many friends the list starts folded. */
const COLLAPSE_AFTER = 3;

interface Reveal {
  open: boolean;
  toggle: () => void;
  show: () => void;
  count: number;
  panelId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
}

const RevealContext = createContext<Reveal | null>(null);

function useReveal(): Reveal {
  const value = useContext(RevealContext);
  if (!value) throw new Error("Used outside <PeopleReveal>");
  return value;
}

export function PeopleReveal({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  /*
   * Derived from a prop, so the server and the first client render agree and
   * nothing flickers. Somebody who adds their fourth friend does not have the
   * list fold under them mid-session — this is only ever the starting point.
   */
  const [open, setOpen] = useState(count <= COLLAPSE_AFTER);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const toggle = useCallback(() => setOpen((was) => !was), []);

  /*
   * Opening from the count means opening something that is off-screen, so the
   * list is brought to the reader rather than the reader sent hunting for it.
   * Smooth, and only when it was actually shut — re-scrolling a list that was
   * already open would yank the page for no reason.
   */
  const show = useCallback(() => {
    setOpen((was) => {
      if (!was) {
        window.requestAnimationFrame(() =>
          panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
      return true;
    });
  }, []);

  return (
    <RevealContext.Provider value={{ open, toggle, show, count, panelId, panelRef }}>
      {children}
    </RevealContext.Provider>
  );
}

/**
 * How many people you have on Honk, as a thing you can press.
 *
 * The number is here because Honk is worth exactly as much as this number and
 * nothing else — a schedule with no one in it is a worse calendar than the one
 * the registrar already gave you. Putting it where it is read in a glance,
 * every session, is the cheapest honest pressure there is.
 *
 * It has to *look* pressed-able, which a hairline pill with a number in it did
 * not: hence the chevron, the cursor, and a hover that commits to the accent
 * rather than hinting at it. The chevron is the part that does the work — it
 * is the one mark on the page that means "there is more behind this".
 *
 * Deliberately not a streak, not a level, and never red. It goes up and never
 * down on its own, so it cannot be broken by a week of not looking.
 */
export function FriendCountButton() {
  const { open, show, toggle, count, panelId } = useReveal();
  const collapsible = count > COLLAPSE_AFTER;

  return (
    <button
      type="button"
      className="friend-count"
      aria-expanded={collapsible ? open : undefined}
      aria-controls={panelId}
      data-open={open}
      onClick={collapsible ? toggle : show}
      aria-label={`${count} ${count === 1 ? "friend" : "friends"} on Honk. ${
        collapsible && open ? "Hide your people." : "See your people."
      }`}
    >
      <span className="friend-count-n mono">{count}</span>
      <span className="friend-count-label">{count === 1 ? "friend" : "friends"}</span>
      <Chevron />
    </button>
  );
}

function Chevron() {
  return (
    <svg
      className="friend-count-chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The friends list, folded or not.
 *
 * When it is folded the section does not simply vanish — a row stands in its
 * place saying what is behind it and opening it when pressed. The count at the
 * top of the page is the answer to "where did my people go"; this is the
 * answer for somebody who never looked up there.
 */
export function PeopleList({ children }: { children: React.ReactNode }) {
  const { open, toggle, count, panelId, panelRef } = useReveal();

  if (count > COLLAPSE_AFTER && !open) {
    return (
      <button type="button" className="reveal-row" onClick={toggle} aria-controls={panelId}>
        <span>
          Show your {count} {count === 1 ? "friend" : "friends"}
        </span>
        <Chevron />
      </button>
    );
  }

  return (
    <div id={panelId} ref={panelRef} className="scroll-mt-4">
      {children}
    </div>
  );
}
