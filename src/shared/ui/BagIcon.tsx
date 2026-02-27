import type { SVGProps } from "react";

type BagIconVariant = 1 | 2 | 3 | 4;

// Change this value (1-4) to quickly test each bag icon across the app.
const BAG_ICON_VARIANT: BagIconVariant = 4;

interface BagIconProps extends SVGProps<SVGSVGElement> {
  variant?: BagIconVariant;
}

const BagIcon = ({ variant = BAG_ICON_VARIANT, ...props }: BagIconProps) => {
  if (variant === 2) {
    return (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="5" y="8" width="14" height="13" rx="3" fill="currentColor" />
        <path
          d="M9 8V6C9 4.5 10.5 3 12 3C13.5 3 15 4.5 15 6V8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (variant === 3) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <rect x="3" y="7" width="18" height="13" rx="2" ry="2" />
        <path d="M16 3a4 4 0 0 1-8 0" />
        <line x1="3" y1="7" x2="21" y2="7" />
      </svg>
    );
  }

  if (variant === 4) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <rect x="4" y="8" width="16" height="12" rx="3" fill="none" />
        <path d="M8.8 8V5.3C8.8 3.3 10.6 2 12 2C13.4 2 15.2 3.3 15.2 5.3V8" fill="none" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
};

export default BagIcon;
