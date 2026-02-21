"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: {
    bg: "from-emerald-500/20 via-emerald-500/10 to-transparent",
    icon: "bg-emerald-500/20 text-emerald-400",
    border: "border-emerald-500/30",
  },
  error: {
    bg: "from-red-500/20 via-red-500/10 to-transparent",
    icon: "bg-red-500/20 text-red-400",
    border: "border-red-500/30",
  },
  warning: {
    bg: "from-amber-500/20 via-amber-500/10 to-transparent",
    icon: "bg-amber-500/20 text-amber-400",
    border: "border-amber-500/30",
  },
  info: {
    bg: "from-blue-500/20 via-blue-500/10 to-transparent",
    icon: "bg-blue-500/20 text-blue-400",
    border: "border-blue-500/30",
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = icons[toast.type];
  const style = styles[toast.type];

  return (
    <div
      className={`
        toast-enter relative overflow-hidden
        flex items-start gap-3 p-4 pr-10
        rounded-xl border ${style.border}
        bg-gradient-to-r ${style.bg}
        backdrop-blur-xl
        shadow-lg shadow-black/20
        min-w-[320px] max-w-[420px]
      `}
      role="alert"
    >
      {/* Glow effect */}
      <div className={`absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-30 -ml-16 -mt-16 ${
        toast.type === "success" ? "bg-emerald-500" :
        toast.type === "error" ? "bg-red-500" :
        toast.type === "warning" ? "bg-amber-500" : "bg-blue-500"
      }`} />
      
      <div className={`relative flex-shrink-0 w-8 h-8 rounded-lg ${style.icon} flex items-center justify-center`}>
        <Icon size={16} />
      </div>
      
      <p className="relative flex-1 text-sm text-foreground font-medium leading-relaxed pt-1">
        {toast.message}
      </p>
      
      <button
        onClick={() => onDismiss(toast.id)}
        className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info", duration: number = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = { id, message, type, duration };
    
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }
  }, [dismiss]);

  const contextValue: ToastContextType = {
    toast: addToast,
    success: (message, duration) => addToast(message, "success", duration),
    error: (message, duration) => addToast(message, "error", duration ?? 5000),
    warning: (message, duration) => addToast(message, "warning", duration),
    info: (message, duration) => addToast(message, "info", duration),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
