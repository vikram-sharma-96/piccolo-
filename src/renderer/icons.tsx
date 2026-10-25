import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  back: "m14 6-6 6 6 6",
  forward: "m10 6 6 6-6 6",
  reload: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
  home: "m3 10 9-7 9 7v10H6V10m4 10v-7h4v7",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  settings:
    "m9 3-.8 3-2.9.8-2.2 3 2 2.3-.1 3 2.8 1.7L9 20h5l1.2-3.2 2.8-1.7-.1-3 2-2.3-2.2-3-2.9-.8L14 3Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  grid: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
  shield: "m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-3 10 2 2 4-4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  pin: "m8 3 8 0-1 6 4 4h-6v8l-2-3v-5H5l4-4Z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12",
  edit: "m4 16 12-12 4 4L8 20H4Zm10-10 4 4",
  folder: "M3 6h7l2 3h9v12H3Z",
  check: "m5 12 4 4L19 6",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  chart: "M4 3v18h17M8 16v-4m5 4V8m5 8V5",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  volume: "m3 9 5 0 5-5v16l-5-5H3Zm14-3q6 6 0 12",
  sleep: "M5 5h7l-7 8h7m3-10h6l-6 7h6",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={paths[name] || paths.globe} />
    </svg>
  );
}
