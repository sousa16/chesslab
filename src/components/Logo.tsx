"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  clickable?: boolean;
  onLogoClick?: () => void;
  showIcon?: boolean;
}

export function Logo({
  size = "md",
  clickable = true,
  onLogoClick,
  showIcon = false,
}: LogoProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const sizeClasses: Record<Required<LogoProps>["size"], string> = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-4xl",
  };

  const isClickable = clickable && session;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    // If onLogoClick callback is provided (like on /home page), use it
    if (onLogoClick) {
      onLogoClick();
    } else {
      // Otherwise, navigate to clean /home to reset drawer state
      router.push("/home");
    }
  };

  const content = (
    <div
      className={`flex items-center gap-2 font-semibold tracking-tight ${sizeClasses[size]} ${isClickable ? "hover:opacity-80 transition-opacity cursor-pointer" : "cursor-default"}`}>
      {showIcon && (
        <img
          src="/android-chrome-192x192.png"
          alt="Chesslab Logo"
          className={`${size === "sm" ? "w-6 h-6" : size === "md" ? "w-8 h-8" : size === "lg" ? "w-10 h-10" : "w-12 h-12"}`}
        />
      )}
      <div>
        <span className="text-foreground">Chess</span>
        <span style={{ color: "hsl(158 35% 38%)" }}>lab</span>
      </div>
    </div>
  );

  return isClickable ? (
    <Link href="/home" onClick={handleClick}>
      {content}
    </Link>
  ) : (
    content
  );
}
