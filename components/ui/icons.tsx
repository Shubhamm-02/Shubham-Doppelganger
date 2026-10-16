import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: 16 | 20 };

function createIcon(paths: React.ReactNode) {
  return function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={size === 20 ? 1.2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const SendIcon = createIcon(<path d="M8 13V3M3.75 7.25 8 3l4.25 4.25" />);

export const StopIcon = createIcon(<rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.5" fill="currentColor" stroke="none" />);

export const PlusIcon = createIcon(<path d="M8 3v10M3 8h10" />);

export const SidebarIcon = createIcon(
  <>
    <rect x="2" y="2.75" width="12" height="10.5" rx="2" />
    <path d="M6.25 2.75v10.5" />
  </>
);

export const MoreIcon = createIcon(
  <g fill="currentColor" stroke="none">
    <circle cx="3.5" cy="8" r="1.1" />
    <circle cx="8" cy="8" r="1.1" />
    <circle cx="12.5" cy="8" r="1.1" />
  </g>
);

export const SunIcon = createIcon(
  <>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
  </>
);

export const MoonIcon = createIcon(<path d="M13.25 9.6A5.5 5.5 0 1 1 6.4 2.75a4.25 4.25 0 0 0 6.85 6.85Z" />);

export const MonitorIcon = createIcon(
  <>
    <rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1.5" />
    <path d="M5.5 13.75h5M8 11v2.75" />
  </>
);

export const MicIcon = createIcon(
  <>
    <rect x="5.75" y="1.75" width="4.5" height="7.5" rx="2.25" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25" />
  </>
);

export const MicOffIcon = createIcon(
  <>
    <path d="M10.25 6.5V4a2.25 2.25 0 0 0-4.4-.66M5.75 6.75V7a2.25 2.25 0 0 0 3.6 1.8" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 7.2 3.6M12.5 7.5a4.5 4.5 0 0 1-.3 1.6M8 12v2.25M2.5 2.5l11 11" />
  </>
);

export const PhoneOffIcon = createIcon(
  <path d="M1.75 9.4c3.55-3.2 8.95-3.2 12.5 0l-1.4 2.1a.75.75 0 0 1-.9.28l-1.95-.78a.75.75 0 0 1-.47-.7V8.75a6.4 6.4 0 0 0-3.06 0v1.55a.75.75 0 0 1-.47.7l-1.95.78a.75.75 0 0 1-.9-.28Z" />
);

export const CopyIcon = createIcon(
  <>
    <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5" />
    <path d="M10.75 5.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
  </>
);

export const CheckIcon = createIcon(<path d="m3 8.5 3.25 3.25L13 4.75" />);

export const RefreshIcon = createIcon(<path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71M13.25 2.5v3h-3" />);

export const TrashIcon = createIcon(
  <path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4 4.25l.6 8.5a1.25 1.25 0 0 0 1.25 1.25h4.3a1.25 1.25 0 0 0 1.25-1.25l.6-8.5M6.75 7v4M9.25 7v4" />
);

export const PencilIcon = createIcon(<path d="M10.5 2.75 13.25 5.5 6 12.75l-3.25.5.5-3.25ZM9.25 4 12 6.75" />);

export const ArrowDownIcon = createIcon(<path d="M8 3v10M3.75 8.75 8 13l4.25-4.25" />);

export const CalendarIcon = createIcon(
  <>
    <rect x="2" y="3" width="12" height="11" rx="1.75" />
    <path d="M2 6.5h12M5.5 1.75v2.5M10.5 1.75v2.5" />
  </>
);

export const ExternalIcon = createIcon(
  <path d="M9.5 2.5h4v4M13.5 2.5l-6 6M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
);

export const XIcon = createIcon(<path d="m4 4 8 8M12 4l-8 8" />);

export const ChevronLeftIcon = createIcon(<path d="M10 3.5 5.5 8l4.5 4.5" />);

export const ChevronRightIcon = createIcon(<path d="M6 3.5 10.5 8 6 12.5" />);

export const ClockIcon = createIcon(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75V8l2.25 1.5" />
  </>
);

export const AlertIcon = createIcon(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.75" />
    <circle cx="8" cy="11" r="0.6" fill="currentColor" />
  </>
);

export const InfoIcon = createIcon(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25V11" />
    <circle cx="8" cy="5" r="0.6" fill="currentColor" />
  </>
);
