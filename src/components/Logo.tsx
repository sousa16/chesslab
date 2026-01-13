interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
}

export function Logo({ size = "md" }: LogoProps) {
  const sizeClasses: Record<Required<LogoProps>["size"], string> = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-4xl",
  };

  return (
    <div className={`font-semibold tracking-tight ${sizeClasses[size]}`}>
      <span className="text-foreground">Chess</span>
      <span style={{ color: "hsl(158 35% 38%)" }}>lab</span>
    </div>
  );
}
