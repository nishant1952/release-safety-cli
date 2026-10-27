// Files that are not a code path: nothing in them runs as the application. They are listed in the
// brief but carry no path or reach; a change made only of them has low damage.

export type NonCodeKind = "docs" | "stylesheet" | "lockfile" | "workflow" | "compose" | "script" | "editor config";

const KINDS: { kind: NonCodeKind; test: RegExp }[] = [
  { kind: "editor config", test: /(^|\/)\.(cursor|claude|vscode)\// },
  { kind: "docs", test: /\.(md|mdx|txt)$/i },
  { kind: "stylesheet", test: /\.(css|scss)$/i },
  { kind: "lockfile", test: /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?)$/ },
  { kind: "workflow", test: /^\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)\.gitlab-ci\.ya?ml$/ },
  { kind: "compose", test: /(^|\/)(docker-)?compose[^/]*\.ya?ml$/ },
  { kind: "script", test: /(^|\/)scripts\/.+\.(sh|bash)$/ },
];

/** The non-code kind of a path, or null when it may be code. First match wins. */
export function nonCodeKind(path: string): NonCodeKind | null {
  return KINDS.find((k) => k.test.test(path))?.kind ?? null;
}

/** "README.md (docs), styles.css (stylesheet)" */
export const listNonCode = (paths: string[]) => paths.map((p) => `${p} (${nonCodeKind(p)})`).join(", ");
