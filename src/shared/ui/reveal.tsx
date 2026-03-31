import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  once?: boolean;
}

const Reveal = ({ children, className, delayMs = 0, once = true }: RevealProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsVisible(true);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setIsVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (rafRef.current) {
            window.cancelAnimationFrame(rafRef.current);
          }
          if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
          }
          rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            timeoutRef.current = window.setTimeout(() => {
              setIsVisible(true);
              timeoutRef.current = null;
              if (once) {
                observer.disconnect();
              }
            }, 40);
          });
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px 20% 0px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [once]);

  return (
    <div
      ref={ref}
      className={cn(
        "opacity-0 translate-y-5 transition-all duration-300 ease-out motion-reduce:transform-none motion-reduce:opacity-100",
        isVisible && "opacity-100 translate-y-0",
        className,
      )}
      style={{ transitionDelay: delayMs ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  );
};

export default Reveal;
