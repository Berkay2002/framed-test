"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // Toggle between dark and light themes
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="flex">
      <Button 
        onClick={toggleTheme}
        variant="ghost"
        className="flex items-center text-foreground bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-md"
      >
        {theme === 'dark' ? (
          <>
            <Sun className="h-4 w-4 mr-2" /> Light Mode
          </>
        ) : (
          <>
            <Moon className="h-4 w-4 mr-2" /> Dark Mode
          </>
        )}
      </Button>
    </div>
  );
}
