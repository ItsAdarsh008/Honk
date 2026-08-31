import Link from "next/link";

/**
 * How many people you have on Honk, as a thing you can press.
 *
 * The number is here because Honk is worth exactly as much as this number and
 * nothing else — a schedule with no one in it is a worse calendar than the one
 * the registrar already gave you. Putting it on the page where it can be read
 * in a glance, every session, is the cheapest honest pressure there is.
 *
 * It is a link rather than a label because a count that cannot be acted on is
 * a scoreboard, and a scoreboard is the kind of thing this app has otherwise
 * refused to grow. Pressing it goes to the people, where the requests waiting
 * on an answer are — the fastest friend anybody adds is one who already asked.
 *
 * Deliberately not a streak, not a level, and never red. It goes up and it
 * never goes down on its own, so it cannot be broken by a week of not looking.
 */
export function FriendCount({ count }: { count: number }) {
  return (
    <Link
      href="/home#people"
      className="friend-count"
      aria-label={`${count} ${count === 1 ? "friend" : "friends"} on Honk. See your people.`}
    >
      <span className="friend-count-n mono">{count}</span>
      <span className="friend-count-label">
        {count === 1 ? "friend" : "friends"}
      </span>
    </Link>
  );
}
