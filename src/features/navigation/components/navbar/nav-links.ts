export interface PrimaryNavState {
  isWomensActive: boolean;
  isMensActive: boolean;
  isAboutActive: boolean;
  isFaqActive: boolean;
}

export const getPrimaryNavLinks = ({
  isWomensActive,
  isMensActive,
  isAboutActive,
  isFaqActive,
}: PrimaryNavState) => [
  { to: "/collection/women", label: "Women's", isActive: isWomensActive },
  { to: "/collection/men", label: "Men's", isActive: isMensActive },
  { to: "/about", label: "About", isActive: isAboutActive },
  { to: "/faq", label: "FAQ", isActive: isFaqActive },
] as const;
