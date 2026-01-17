"use client";

interface ColorBadgeProps {
  color: "white" | "black";
}

export function ColorBadge({ color }: ColorBadgeProps) {
  return (
    <div
      className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm border ${
        color === "white"
          ? "bg-zinc-100 border-zinc-200"
          : "bg-zinc-800 border-zinc-700"
      }`}>
      <span
        className={`text-base font-semibold ${
          color === "white" ? "text-zinc-800" : "text-zinc-100"
        }`}>
        {color === "white" ? "♔" : "♚"}
      </span>
    </div>
  );
}
