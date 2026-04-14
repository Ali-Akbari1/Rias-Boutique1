export interface PrimaryNavState {
  isWomensActive: boolean;
  isMensActive: boolean;
  isJewelryActive: boolean;
  isAboutActive: boolean;
  isFaqActive: boolean;
}

export interface PrimaryNavLink {
  to: string;
  label: string;
  isActive: boolean;
}

export const getPrimaryNavLinks = ({
  isWomensActive,
  isMensActive,
  isJewelryActive,
  isAboutActive,
  isFaqActive,
}: PrimaryNavState): readonly PrimaryNavLink[] =>
  [
    { to: "/collection/women", label: "Women's", isActive: isWomensActive },
    { to: "/collection/men", label: "Men's", isActive: isMensActive },
    { to: "/collection/jewelry", label: "Jewelry", isActive: isJewelryActive },
    { to: "/about", label: "About", isActive: isAboutActive },
    { to: "/faq", label: "FAQ", isActive: isFaqActive },
  ] as const;
