import ThemeSwitcher from "@/components/theme-switcher";

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background/80 backdrop-blur-sm relative">
      {/* Footer fade gradient for smooth transition */}
      <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-t from-transparent to-background/80 -mt-4"></div>
      
      {/* Animated border line at top - make it more subtle */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
      
      {/* Game-themed elements */}
      <div className="absolute left-8 bottom-4 opacity-40 hidden md:block">
        <div className="pixel-character-mini">
          <div className="pixel-head-mini"></div>
          <div className="pixel-body-mini"></div>
        </div>
      </div>
      
      <div className="absolute right-8 bottom-5 opacity-40 hidden md:block">
        <div className="pixel-chest animate-float">
          <div className="pixel-chest-lid"></div>
          <div className="pixel-chest-base"></div>
        </div>
      </div>
      
      {/* Random pixel dots for decoration */}
      <div className="absolute w-2 h-2 bg-primary/30 rounded-sm left-[12%] top-1/2 animate-pulse"></div>
      <div className="absolute w-2 h-2 bg-primary/20 rounded-sm right-[15%] top-1/3 animate-ping-slow"></div>
      <div className="absolute w-3 h-3 bg-primary/10 left-1/4 bottom-3 animate-bounce-slow"></div>
      
      <div className="max-w-7xl mx-auto px-5 py-6 flex items-center justify-between relative z-10">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground flex items-center">
            <span className="inline-block w-4 h-4 bg-primary/20 rounded-sm mr-2 animate-pulse"></span>
            © 2025 <span className="text-foreground font-medium ml-1 glow-text-sm">Framed</span>. No rights reserved.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pixel-controller-icon mr-2 hidden sm:block"></div>
          <span className="text-xs text-muted-foreground mr-2 hidden sm:inline-block">Switch Theme:</span>
          <ThemeSwitcher />
        </div>
      </div>
      
      {/* Moving dots like in classic games */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
        <div className="pacman-dots"></div>
      </div>
    </footer>
  );
} 