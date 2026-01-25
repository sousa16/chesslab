"use client";

import * as React from "react";
import { CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const showToast = React.useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-success" />,
    error: <XCircle className="h-5 w-5 text-destructive" />,
    warning: <AlertCircle className="h-5 w-5 text-warning" />,
  };

  const borderColors = {
    success: "border-success/30",
    error: "border-destructive/30",
    warning: "border-warning/30",
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-5 py-4 rounded-xl
        bg-surface-2 border-2 ${borderColors[toast.type]}
        shadow-2xl backdrop-blur-md
        animate-in zoom-in-95 fade-in duration-200
        min-w-[320px] max-w-md pointer-events-auto
      `}>
      {icons[toast.type]}
      <p className="text-base text-foreground flex-1 font-medium">
        {toast.message}
      </p>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
