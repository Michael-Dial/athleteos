// Minimal stroke icon set (24px grid, currentColor) so the app has no icon dependency.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconLogo = (p: P) => (
  <Svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>
);
export const IconToday = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>
);
export const IconWatch = (p: P) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6l1-4h4l1 4M9 18l1 4h4l1-4M12 9v3l2 1" /></Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>
);
export const IconHistory = (p: P) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l4 2" /></Svg>
);
export const IconForm = (p: P) => (
  <Svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></Svg>
);
export const IconPulse = (p: P) => (
  <Svg {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" /><path d="M7 12h2l1.5-2 2 4 1.5-2h3" /></Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Svg>
);
export const IconDevice = (p: P) => (
  <Svg {...p}><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 7V4h4v3M10 17v3h4v-3" /></Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h0" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);
export const IconMinus = (p: P) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const IconDown = (p: P) => (
  <Svg {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconLeft = (p: P) => (
  <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>
);
export const IconRight = (p: P) => (
  <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
);
export const IconUp = (p: P) => (
  <Svg {...p}><path d="m18 15-6-6-6 6" /></Svg>
);
export const IconDownChevron = (p: P) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></Svg>
);
export const IconLogout = (p: P) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>
);
