export interface PrimaryNavState {
  isWomensActive: boolean;
  isMensActive: boolean;
  isBridalActive: boolean;
  isJewelryActive: boolean;
  isAboutActive: boolean;
  isFaqActive: boolean;
}

export interface PrimaryNavLink {
  to: string;
  label: string;
  isActive: boolean;
}

export const getMobileNavLinks = ({
  isWomensActive,
  isMensActive,
  isJewelryActive,
}: PrimaryNavState): readonly PrimaryNavLink[] =>
  [
    { to: "/collection", label: "Shop All", isActive: false },
    { to: "/collection/women", label: "Women's", isActive: isWomensActive },
    { to: "/collection/men", label: "Men's", isActive: isMensActive },
    { to: "/collection/jewelry", label: "Jewelry", isActive: isJewelryActive },
  ] as const;
