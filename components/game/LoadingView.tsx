import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface LoadingViewProps {
  message?: string;
  timeout?: number;
}

export default function LoadingView({ 
  message = "Loading room...", 
  timeout = 10000 
}: LoadingViewProps) {
  const router = useRouter();
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showExtendedOptions, setShowExtendedOptions] = useState(false);
  
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
      toast.error("Loading is taking longer than expected");
    }
  }, [timeElapsed, timeout]);
  
  const handleReload = () => {
    router.refresh();
  };
  
  const handleClearCacheAndReload = () => {
    localStorage.clear();
    sessionStorage.clear();
    toast.success("Storage cleared");
    setTimeout(() => router.refresh(), 500);
  };
  
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 bg-background min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            <h1 className="text-2xl font-semibold text-center">{message}</h1>
            <p className="text-muted-foreground text-center mb-2">
              This might take a few moments
            </p>
            {timeElapsed > 3000 && (
              <p className="text-xs text-muted-foreground">
                Loading for {Math.floor(timeElapsed / 1000)} seconds...
              </p>
            )}
            
            {/* Troubleshooting section */}
            <div className="w-full border-t border-border pt-4 mt-4">
              <p className="text-sm text-muted-foreground mb-2">
                {showExtendedOptions 
                  ? "Try these options to resolve the issue:" 
                  : "If loading takes too long:"}
              </p>
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