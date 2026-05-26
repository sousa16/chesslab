import { Logo } from "@/components/Logo";

export default function Loading() {
  return (
    <div className="h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse" />
          <div className="relative">
            <Logo size="xl" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" />
          <span
            className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}
