"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Gamepad2, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

export default function Header() {
  const [loaded, setLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [bounceActive, setBounceActive] = useState(false);

  // Animation on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaded(true);
    }, 100);
    
    // Create periodic bounce effect
    const bounceInterval = setInterval(() => {
      setBounceActive(true);
      setTimeout(() => setBounceActive(false), 1000);
    }, 5000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(bounceInterval);
    };
  }, []);

  return (
    <div className="flex flex-col gap-10 items-center justify-center py-8 w-full max-w-5xl mx-auto px-4">
      {/* Main hero content with animations */}
      <div className={`transform transition-all duration-1000 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        <div className="relative">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-center game-title">
            Framed
          </h1>
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary/30 animate-ping-slow"></div>
        </div>
      </div>
      
      <p className={`text-xl lg:text-2xl !leading-tight mx-auto max-w-xl text-center text-muted-foreground transition-all duration-1000 delay-300 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        A social deduction game where the impostor doesn't know they're lying.
      </p>
      
      {/* Interactive button with hover effects */}
      <div 
        className={`relative transition-all duration-1000 delay-500 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <Button 
          asChild 
          className={`w-full max-w-xs bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20 relative overflow-hidden transition-all duration-300 ${bounceActive ? 'animate-gentle-bounce' : ''} ${hovering ? 'shadow-glow scale-105' : 'scale-100'}`}
        >
          <Link href="/game-hub" className="flex items-center justify-center gap-2 py-6">
            <Gamepad2 className={`transition-transform duration-300 ${hovering ? 'rotate-12' : ''}`} />
            <span>Enter Game Hub</span>
            <ArrowRight className={`ml-1 transition-all duration-300 ${hovering ? 'translate-x-1 opacity-100' : 'opacity-0'}`} />
          </Link>
        </Button>
        
        {/* Button glow effect */}
        {/* <div className={`absolute inset-0 bg-primary/5 rounded-md filter blur-xl transition-opacity duration-300 ${hovering ? 'opacity-100' : 'opacity-0'}`}></div> */}
      </div>
      
      {/* Animated divider */}
      <div className="w-full h-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"></div>
        <div className="absolute h-full w-1/3 bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-slide-rtl"></div>
      </div>
    </div>
  );
}
