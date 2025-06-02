import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const AMONG_US_GIFS = [
  "/gif/among-us-vibe.gif",
  "/gif/among-us-cable.gif",
  "/gif/among-us-card.gif"
];

// Among Us character colors for background elements
const AMONG_US_COLORS = [
  "#c51111", // Red
  "#132ed1", // Blue
  "#117f2d", // Green
  "#ed54ba", // Pink
  "#ef7d0d", // Orange
  "#f5f557", // Yellow
  "#3f474e", // Black
  "#d6e0f0", // White
  "#6b2fbb", // Purple
  "#71491e", // Brown
  "#38fedc", // Cyan
  "#50ef39", // Lime
];

interface AmongUsGifLoadingViewProps {
  message?: string;
  timeout?: number;
  fullHeight?: boolean;
  onTimeout?: () => void;
  isLoaded?: boolean;
  minDisplayTime?: number;
  transitionKey?: string;
}

export default function AmongUsGifLoadingView({ 
  message = "Loading room...", 
  timeout = 10000,
  fullHeight = false,
  onTimeout,
  isLoaded = false,
  minDisplayTime = 2000,
  transitionKey
}: AmongUsGifLoadingViewProps) {
  const router = useRouter();
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showExtendedOptions, setShowExtendedOptions] = useState(false);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [selectedGif, setSelectedGif] = useState(AMONG_US_GIFS[0]);
  const [canTransition, setCanTransition] = useState(false);
  const [displayStartTime] = useState(Date.now());
  const [transitionInitiated, setTransitionInitiated] = useState(false);
  const [hoveringReload, setHoveringReload] = useState(false);
  const [floatingCrewmates, setFloatingCrewmates] = useState<{color: string, x: number, y: number, size: number, speed: number, rotation: number}[]>([]);

  // Generate random floating crewmates for the background
  useEffect(() => {
    const crewmates = [];
    for (let i = 0; i < 8; i++) {
      crewmates.push({
        color: AMONG_US_COLORS[Math.floor(Math.random() * AMONG_US_COLORS.length)],
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 10 + Math.random() * 15,
        speed: 2 + Math.random() * 3,
        rotation: Math.random() * 360
      });
    }
    setFloatingCrewmates(crewmates);
  }, []);

  // Pick a random GIF on mount - but only once per component lifecycle
  useEffect(() => {
    // Always select a random GIF, even with transitionKey
    const randomIndex = Math.floor(Math.random() * AMONG_US_GIFS.length);
    setSelectedGif(AMONG_US_GIFS[randomIndex]);
    console.log(`Selected Among Us GIF: ${randomIndex + 1} of ${AMONG_US_GIFS.length}`);
  }, []);
  
  // Show extended options after 5 seconds of loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowExtendedOptions(true);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Track loading time
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1000);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Handle minimum display time logic
  useEffect(() => {
    if (!isLoaded || transitionInitiated) return;
    
    const elapsedTime = Date.now() - displayStartTime;
    console.log(`Loading view: elapsed ${elapsedTime}ms of ${minDisplayTime}ms minimum`);
    
    if (elapsedTime >= minDisplayTime) {
      // We've already displayed for minimum time, can transition immediately
      console.log("Minimum display time already met, ready to transition");
      setCanTransition(true);
    } else {
      // Need to wait for remaining time
      const remainingTime = minDisplayTime - elapsedTime;
      console.log(`Waiting ${remainingTime}ms more to meet minimum display time`);
      
      const timer = setTimeout(() => {
        console.log("Minimum display time now met, ready to transition");
        setCanTransition(true);
      }, remainingTime);
      
      return () => clearTimeout(timer);
    }
  }, [isLoaded, minDisplayTime, displayStartTime, transitionInitiated]);

  // If content is loaded and we've displayed for minimum time, trigger transition
  useEffect(() => {
    if (isLoaded && canTransition && onTimeout && !transitionInitiated) {
      // Prevent multiple calls to onTimeout
      setTransitionInitiated(true);
      console.log("Transition criteria met, calling onTimeout");
      
      // Use onTimeout callback to signal that we're ready to transition
      onTimeout();
    }
  }, [isLoaded, canTransition, onTimeout, transitionInitiated]);
  
  // Show timeout message and options if loading takes too long
  useEffect(() => {
    if (timeElapsed >= timeout && !loadingFailed) {
      console.log("Loading timeout reached");
      setLoadingFailed(true);
      
      // If an onTimeout callback is provided, call it
      if (onTimeout && !transitionInitiated) {
        setTransitionInitiated(true);
        onTimeout();
      }
    }
  }, [timeElapsed, timeout, onTimeout, loadingFailed, transitionInitiated]);
  
  const handleReload = () => {
    setTimeElapsed(0);
    setLoadingFailed(false);
    router.refresh();
  };
  
  const handleClearCacheAndReload = () => {
    localStorage.clear();
    sessionStorage.clear();
    toast.success("Storage cleared");
    setTimeout(() => {
      setTimeElapsed(0);
      setLoadingFailed(false);
      router.refresh();
    }, 500);
  };
  
  return (
    <div className={`max-w-6xl mx-auto py-8 px-4 flex items-center justify-center relative ${fullHeight ? 'min-h-screen' : ''}`}>
      {/* Game grid background with floating crewmates */}
      <div className="absolute inset-0 game-grid-bg overflow-hidden">
        {floatingCrewmates.map((crewmate, index) => (
          <div 
            key={index}
            className="absolute rounded-t-[50%] game-card-float"
            style={{
              backgroundColor: crewmate.color,
              width: `${crewmate.size}px`,
              height: `${crewmate.size * 1.2}px`,
              left: `${crewmate.x}%`,
              top: `${crewmate.y}%`,
              animationDuration: `${crewmate.speed}s`,
              transform: `rotate(${crewmate.rotation}deg)`,
              opacity: 0.3,
              zIndex: 0
            }}
          />
        ))}
      </div>

      <Card className="w-full max-w-md mx-auto relative z-10 border border-primary/20 shadow-lg bg-background/95 backdrop-blur-sm">
        {/* Top edge glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4">
            {!loadingFailed ? (
              <div className="flex flex-col items-center relative">
                {/* Background pulse effect */}
                <div className="absolute inset-0 bg-primary/5 rounded-full filter blur-md animate-pulse-slow"></div>
                
                <div className="relative p-2 rounded-full bg-primary/10 border border-primary/20 shadow-glow transform hover:scale-105 transition-transform duration-300">
                  <img 
                    src={selectedGif} 
                    alt="Among Us loading" 
                    className="w-40 h-40 object-contain rounded-full"
                    draggable={false}
                  />
                </div>
                
                {/* Loading scanner line effect */}
                <div className="absolute inset-0 overflow-hidden rounded-full opacity-30">
                  <div className="w-full h-2 bg-primary/50 absolute animate-scanner-line"></div>
                </div>
              </div>
            ) : (
              <div className="h-16 w-16 flex items-center justify-center text-destructive relative">
                <div className="absolute inset-0 bg-destructive/10 rounded-full animate-ping-slow opacity-60"></div>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            )}
            
            <h1 className="text-2xl font-semibold text-center game-title">
              {loadingFailed ? "Loading timed out" : message}
            </h1>
            
            <p className="text-muted-foreground text-center mb-2">
              {loadingFailed 
                ? "We couldn't load the content in a reasonable time" 
                : "This might take a few moments"}
            </p>
            
            {timeElapsed > 2000 && (
              <div className="flex items-center gap-2">
                <div className="time-bar w-32 h-2 bg-background overflow-hidden rounded-full border border-primary/20">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/40 to-primary/60" 
                    style={{ width: `${Math.min(100, (timeElapsed / timeout) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {Math.floor(timeElapsed / 1000)}s
                </p>
              </div>
            )}
            
            {/* Troubleshooting section */}
            <div className="w-full border-t border-primary/20 pt-4 mt-4">
              <div className="flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleReload}
                  className="relative overflow-hidden group border-primary/20 hover:border-primary/40 transition-colors"
                  onMouseEnter={() => setHoveringReload(true)}
                  onMouseLeave={() => setHoveringReload(false)}
                >
                  <span className="relative z-10">Reload page</span>
                  <div className={`absolute inset-0 bg-primary/10 transform transition-transform duration-300 origin-left ${hoveringReload ? 'scale-x-100' : 'scale-x-0'}`}></div>
                </Button>
                
                <Link href="/game-hub">
                  <Button variant="ghost" className="w-full border border-primary/10 hover:bg-primary/5 transition-colors">
                    Return to Game Hub
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
        
        {/* Bottom edge glow */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      </Card>
    </div>
  );
} 