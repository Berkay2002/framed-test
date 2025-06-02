import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface MarioGifLoadingViewProps {
  message?: string;
  timeout?: number;
  fullHeight?: boolean;
  onTimeout?: () => void;
  isLoaded?: boolean;
  minDisplayTime?: number;
  transitionKey?: string;
}

export default function MarioGifLoadingView({ 
  message = "Loading room...", 
  timeout = 10000,
  fullHeight = false,
  onTimeout,
  isLoaded = false,
  minDisplayTime = 2000
}: MarioGifLoadingViewProps) {
  const router = useRouter();
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showExtendedOptions, setShowExtendedOptions] = useState(false);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [canTransition, setCanTransition] = useState(false);
  const [displayStartTime] = useState(Date.now());
  
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
  
  // Show timeout message and options if loading takes too long
  useEffect(() => {
    if (timeElapsed >= timeout) {
      setLoadingFailed(true);
      
      // If an onTimeout callback is provided, call it
      if (onTimeout) {
        onTimeout();
      }
    }
  }, [timeElapsed, timeout, onTimeout]);
  
  // Handle minimum display time logic
  useEffect(() => {
    if (!isLoaded) return;
    
    const elapsedTime = Date.now() - displayStartTime;
    if (elapsedTime >= minDisplayTime) {
      // We've already displayed for minimum time, can transition immediately
      setCanTransition(true);
    } else {
      // Need to wait for remaining time
      const remainingTime = minDisplayTime - elapsedTime;
      const timer = setTimeout(() => {
        setCanTransition(true);
      }, remainingTime);
      
      return () => clearTimeout(timer);
    }
  }, [isLoaded, minDisplayTime, displayStartTime]);

  // If content is loaded and we've displayed for minimum time, trigger transition
  useEffect(() => {
    if (isLoaded && canTransition && onTimeout) {
      // Use onTimeout callback to signal that we're ready to transition
      onTimeout();
    }
  }, [isLoaded, canTransition, onTimeout]);
  
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
    <div className={`max-w-6xl mx-auto py-8 px-4 bg-background flex items-center justify-center ${fullHeight ? 'min-h-screen' : ''}`}>
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4">
            {!loadingFailed ? (
              <div className="flex flex-col items-center">
                <img 
                  src="/gif/mario-run.gif" 
                  alt="Mario running" 
                  className="w-32 h-32 object-contain mario-bounce mb-2"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="h-16 w-16 flex items-center justify-center text-destructive">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            )}
            <h1 className="text-2xl font-semibold text-center">
              {loadingFailed ? "Loading timed out" : message}
            </h1>
            <p className="text-muted-foreground text-center mb-2">
              {loadingFailed 
                ? "We couldn't load the content in a reasonable time" 
                                  : "This might take a few moments"}              </p>              {timeElapsed > 2000 && (                <p className="text-xs text-muted-foreground">                  Loading for {Math.floor(timeElapsed / 1000)} seconds...                </p>              )}                            {/* Troubleshooting section */}
            <div className="w-full border-t border-border pt-4 mt-4">

              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={handleReload}>
                  Reload page
                </Button>
                

                
                <Link href="/game-hub">
                  <Button variant="ghost" className="w-full">
                    Return to Game Hub
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 