"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Sparkles } from "lucide-react";

export default function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // Toggle between dark and light themes with animation
  const toggleTheme = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setTheme(theme === 'dark' ? 'light' : 'dark');
      setTimeout(() => setIsAnimating(false), 300);
    }, 100);
  };

  return (
    <div className="flex">
      <Button 
        onClick={toggleTheme}
        variant="ghost"
        disabled={isAnimating}
        className={`
          flex items-center gap-2 text-foreground 
          bg-primary/20 hover:bg-primary/30 border border-primary/20
          px-3 py-2 rounded-md overflow-hidden relative group
          transition-all duration-300 
          ${isAnimating ? 'scale-95' : 'scale-100'}
        `}
      >
        <div className={`absolute inset-0 opacity-0 ${isAnimating ? 'animate-pulse opacity-20' : ''}`}>
          <Sparkles className="h-16 w-16 text-primary absolute -top-6 -left-6 transform rotate-45 opacity-50" />
          <Sparkles className="h-16 w-16 text-primary absolute -bottom-6 -right-6 transform rotate-12 opacity-50" />
        </div>
        
        <div className={`relative transition-transform duration-300 ${isAnimating ? 'scale-110' : 'scale-100'}`}>
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 animate-spin-slow" />
          ) : (
            <Moon className="h-4 w-4 animate-pulse" />
          )}
        </div>
        
        <span className="relative">
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      </Button>
    </div>
  );
}
