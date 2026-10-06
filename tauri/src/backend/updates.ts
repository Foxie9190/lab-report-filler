export const VERSION = "2.3.0";

const REPO = "Foxie9190/lab-report-filler";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export interface Update {
  version: string; // "2.3.0"
  url: string; // the page to send people to
}

/**
 * "v2.10.0" -> [2, 10, 0]
 *
 * Numbers, not text, because as text "2.10.0" sorts BEFORE "2.9.0" — the
 * classic version-compare bug. Anything non-numeric becomes 0 so a strange
 * tag can't crash the check.
 */
function asNumbers(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Is `candidate` a higher version than `current`? */
export function isNewer(candidate: string, current: string): boolean {
  const a = asNumbers(candidate);
  const b = asNumbers(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false; // same version
}

/**
 * Ask GitHub what the newest release is. Null means "nothing to tell you" —
 * up to date, offline, rate-limited, or GitHub having a bad day. An update
 * check must never be the reason the app fails to start, which is why
 * everything in here ends in null rather than throwing.
 */
export async function checkForUpdate(
  current = VERSION,
): Promise<Update | null> {
  try {
    const response = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
    };
    const tag = data.tag_name ?? "";

    // This repo also has py-v1.x tags for the Python app. Only v2-style
    // tags count, or a Python release could look like an update.
    if (!/^v\d/.test(tag)) return null;
    if (!isNewer(tag, current)) return null;

    return {
      version: tag.replace(/^v/, ""),
      url: data.html_url ?? RELEASES_PAGE,
    };
  } catch {
    return null;
  }
}
