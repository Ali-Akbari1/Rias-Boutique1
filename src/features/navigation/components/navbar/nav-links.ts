import { CircleHelp, Gem, Info, Shirt, Sparkles, type LucideIcon } from "lucide-react";

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
  icon: LucideIcon;
}

export const getPrimaryNavLinks = ({
  isWomensActive,
  isMensActive,
  isJewelryActive,
  isAboutActive,
  isFaqActive,
}: PrimaryNavState): readonly PrimaryNavLink[] =>
  [
    { to: "/collection/women", label: "Women's", isActive: isWomensActive, icon: Sparkles },
    { to: "/collection/men", label: "Men's", isActive: isMensActive, icon: Shirt },
    { to: "/collection/jewelry", label: "Jewelry", isActive: isJewelryActive, icon: Gem },
    { to: "/about", label: "About", isActive: isAboutActive, icon: Info },
    { to: "/faq", label: "FAQ", isActive: isFaqActive, icon: CircleHelp },
  ] as const;
