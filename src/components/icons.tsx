import type { ReactElement, SVGProps } from "react";
import type { ChallengeIcon } from "../types";

type P = SVGProps<SVGSVGElement>;

const S = (p: P): P => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...p,
});

export const HomeIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M3.5 10.4 12 3.6l8.5 6.8" />
    <path d="M5.6 9.4V20h12.8V9.4" />
    <path d="M9.6 20v-5.6h4.8V20" />
  </svg>
);

export const TrophyIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4.2a0 0 0 0 0 0 0c0 3 1.2 4.8 2.8 5.2M17 6h2.8c0 3-1.2 4.8-2.8 5.2" />
    <path d="M12 15v3.4M8.5 20.4h7M9.4 18.4h5.2" />
  </svg>
);

export const ChartIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M4 4v16h16" />
    <path d="M8.2 16v-5M12.4 16V7.5M16.6 16v-3.2" />
  </svg>
);

export const UserIcon = (p: P) => (
  <svg {...S(p)}>
    <circle cx="12" cy="8.2" r="3.6" />
    <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
  </svg>
);

export const FlameIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M12 3.2c.6 3.2-3.8 4.6-3.8 8.6a3.8 3.8 0 0 0 7.6 0c0-1.6-.8-2.7-.8-2.7s2.8 1.1 2.8 3.9a6.6 6.6 0 1 1-13.2-.2C4.6 7.4 11.3 6.9 12 3.2z" />
  </svg>
);

export const FlameFill = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path
      fill="currentColor"
      d="M12 2.2c.7 3.6-4.1 5.2-4.1 9.7a4.1 4.1 0 0 0 8.2 0c0-1.8-.9-3-.9-3s3.1 1.2 3.1 4.3a7.3 7.3 0 1 1-14.6-.2C3.7 7 11.2 6.4 12 2.2z"
    />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M4.5 12.5 10 18 19.5 6.5" />
  </svg>
);

export const UmbrellaIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M3 11a9 9 0 0 1 18 0H3z" />
    <path d="M12 11v7.2a1.9 1.9 0 0 0 3.8 0" />
    <path d="M12 2.6V4" />
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg {...S(p)}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.4V12l3.2 2" />
  </svg>
);

export const BellIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M6 16v-5.4a6 6 0 1 1 12 0V16l1.6 2.4H4.4L6 16z" />
    <path d="M10 20.6a2.1 2.1 0 0 0 4 0" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const XIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const ChevronLeft = (p: P) => (
  <svg {...S(p)}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

export const UsersIcon = (p: P) => (
  <svg {...S(p)}>
    <circle cx="9" cy="8.4" r="3.2" />
    <path d="M3.4 19.4c.7-3.1 3-4.7 5.6-4.7s4.9 1.6 5.6 4.7" />
    <path d="M15.4 5.6a3.2 3.2 0 0 1 0 5.7M17.8 14.9c1.6.7 2.6 2.2 3 4.5" />
  </svg>
);

export const CalendarIcon = (p: P) => (
  <svg {...S(p)}>
    <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
    <path d="M4 10h16M8.5 3.5v3.6M15.5 3.5v3.6" />
  </svg>
);

export const LockIcon = (p: P) => (
  <svg {...S(p)}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);

export const ShuffleIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M3.5 7h3.2c5.8 0 8 10 13.8 10" />
    <path d="M3.5 17h3.2c2 0 3.5-1.2 4.7-2.8M20.5 7h-3.2c-2 0-3.4 1.1-4.6 2.7" />
    <path d="m17.5 4 3 3-3 3M17.5 14l3 3-3 3" />
  </svg>
);

export const LogoutIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M13.5 4H6.8A1.8 1.8 0 0 0 5 5.8v12.4A1.8 1.8 0 0 0 6.8 20h6.7" />
    <path d="M16 8.2 19.8 12 16 15.8M19.4 12H9.6" />
  </svg>
);

export const ZapIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M13 2.8 4.8 13.4h5.4L11 21.2l8.2-10.6h-5.4L13 2.8z" />
  </svg>
);

export const ShieldIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M12 3 5 5.8v6c0 4.4 3 7.6 7 9.2 4-1.6 7-4.8 7-9.2v-6L12 3z" />
    <path d="m9 11.6 2.2 2.2L15.4 9.4" />
  </svg>
);

export const StarIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="m12 3.6 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2 6.9 19l1.1-5.6-4.2-3.9 5.7-.7L12 3.6z" />
  </svg>
);

export const TargetIcon = (p: P) => (
  <svg {...S(p)}>
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="12" r="4.6" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const BookIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="M12 6.2C10.5 4.8 8 4.2 4.5 4.4v13.8c3.5-.2 6 .4 7.5 1.8 1.5-1.4 4-2 7.5-1.8V4.4C16 4.2 13.5 4.8 12 6.2z" />
    <path d="M12 6.2V20" />
  </svg>
);

export const CodeIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="m8 8-4.5 4L8 16M16 8l4.5 4L16 16M13.2 5.5l-2.4 13" />
  </svg>
);

export const LanguageIcon = (p: P) => (
  <svg {...S(p)}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M3.6 12h16.8M12 3.6c-2.4 2.3-3.6 5.1-3.6 8.4s1.2 6.1 3.6 8.4c2.4-2.3 3.6-5.1 3.6-8.4s-1.2-6.1-3.6-8.4z" />
  </svg>
);

export const RunIcon = (p: P) => (
  <svg {...S(p)}>
    <circle cx="14.2" cy="5" r="1.9" />
    <path d="m6.5 20 3-5.2-2.3-2 1-4.6 4-1.4 2.6 3.4 3 .8" />
    <path d="m9.8 12.8 2.7 2.4-1.2 4.8M12.2 8.2 9 9.4l-1 3" />
  </svg>
);

export const StudyIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="m12 4.5 9.5 4.3L12 13.1 2.5 8.8 12 4.5z" />
    <path d="M6.5 10.8v4.6c0 1.5 2.5 2.9 5.5 2.9s5.5-1.4 5.5-2.9v-4.6M21 9v5" />
  </svg>
);

export const WriteIcon = (p: P) => (
  <svg {...S(p)}>
    <path d="m14.5 5 4.5 4.5L8.5 20H4v-4.5L14.5 5z" />
    <path d="m12.5 7 4.5 4.5" />
  </svg>
);

export const GoalIcon = TargetIcon;

export const CHALLENGE_ICONS: Record<ChallengeIcon, (p: P) => ReactElement> = {
  book: BookIcon,
  code: CodeIcon,
  language: LanguageIcon,
  run: RunIcon,
  study: StudyIcon,
  write: WriteIcon,
  goal: GoalIcon,
};

export const ACHIEVEMENT_ICONS: Record<string, (p: P) => ReactElement> = {
  flame: FlameIcon,
  shield: ShieldIcon,
  bolt: ZapIcon,
  book: BookIcon,
  target: TargetIcon,
  calendar: CalendarIcon,
  star: StarIcon,
  trophy: TrophyIcon,
};
