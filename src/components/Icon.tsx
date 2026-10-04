type IconName =
  | "overview"
  | "activity"
  | "shield"
  | "screen"
  | "alert"
  | "arrow"
  | "info"
  | "location";

const paths: Record<IconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  shield: "M12 3l8 3v6c0 5-8 9-8 9S4 17 4 12V6z M8 12l3 3 5-6",
  screen: "M3 4h18v13H3z M8 21h8 M12 17v4",
  alert: "M12 3L2 21h20z M12 9v5 M12 17v.5",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  info: "M12 11v6 M12 7v.5 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  location:
    "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
};

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
