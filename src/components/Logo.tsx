"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  clickable?: boolean;
  onLogoClick?: () => void;
}

export function Logo({ size = "md", clickable = true, onLogoClick }: LogoProps) {
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
    <div className={`font-semibold tracking-tight ${sizeClasses[size]} ${isClickable ? "hover:opacity-80 transition-opacity cursor-pointer" : "cursor-default"}`}>
      <span className="text-foreground">Chess</span>
      <span style={{ color: "hsl(158 35% 38%)" }}>lab</span>
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
