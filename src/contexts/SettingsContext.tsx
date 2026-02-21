"use client";


import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SettingsContextType {
  soundEffects: boolean;
  setSoundEffects: (enabled: boolean) => void;
  showCoordinates: boolean;
  setShowCoordinates: (enabled: boolean) => void;
  moveAnimation: boolean;
  setMoveAnimation: (enabled: boolean) => void;
  dailyReminder: boolean;
  setDailyReminder: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage or defaults
  const [soundEffects, setSoundEffectsState] = useState(true);
  const [showCoordinates, setShowCoordinatesState] = useState(true);
  const [moveAnimation, setMoveAnimationState] = useState(true);
  const [dailyReminder, setDailyReminderState] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedSoundEffects = localStorage.getItem("chesslab-sound-effects");
    const savedShowCoordinates = localStorage.getItem("chesslab-show-coordinates");
    const savedMoveAnimation = localStorage.getItem("chesslab-move-animation");
    const savedDailyReminder = localStorage.getItem("chesslab-daily-reminder");

    if (savedSoundEffects !== null) {
      setSoundEffectsState(savedSoundEffects === "true");
    }
    if (savedShowCoordinates !== null) {
      setShowCoordinatesState(savedShowCoordinates === "true");
    }
    if (savedMoveAnimation !== null) {
      setMoveAnimationState(savedMoveAnimation === "true");
    }
    if (savedDailyReminder !== null) {
      setDailyReminderState(savedDailyReminder === "true");
    }

    setMounted(true);
  }, []);

  const setSoundEffects = (enabled: boolean) => {
    setSoundEffectsState(enabled);
    if (mounted) {
      localStorage.setItem("chesslab-sound-effects", String(enabled));
    }
  };

  const setShowCoordinates = (enabled: boolean) => {
    setShowCoordinatesState(enabled);
    if (mounted) {
      localStorage.setItem("chesslab-show-coordinates", String(enabled));
    }
  };

  const setMoveAnimation = (enabled: boolean) => {
    setMoveAnimationState(enabled);
    if (mounted) {
      localStorage.setItem("chesslab-move-animation", String(enabled));
    }
  };

  const setDailyReminder = async (enabled: boolean) => {
    setDailyReminderState(enabled);
    if (mounted) {
      localStorage.setItem("chesslab-daily-reminder", String(enabled));
      
      // Sync with database
      try {
        await fetch("/api/user/update-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dailyReminder: enabled }),
        });
      } catch (error) {
        console.error("Failed to sync daily reminder setting:", error);
      }
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        soundEffects,
        setSoundEffects,
        showCoordinates,
        setShowCoordinates,
        moveAnimation,
        setMoveAnimation,
        dailyReminder,
        setDailyReminder,
      }}>
      {children}
    </SettingsContext.Provider>
  );
}
