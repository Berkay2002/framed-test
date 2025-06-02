import { useState, useEffect } from "react";
import LoadingView from "./LoadingView";
import PixelLoadingView from "./PixelLoadingView";
import VotingLoadingView from "./VotingLoadingView";
import MarioGifLoadingView from "./MarioGifLoadingView";
import AmongUsGifLoadingView from "./AmongUsGifLoadingView";

export type AnimationType = "speech-bubbles" | "pixel-character" | "voting" | "mario-gif" | "among-us-gif";

interface AnimatedLoadingProps {
  message?: string;
  timeout?: number;
  fullHeight?: boolean;
  onTimeout?: () => void;
  animationType?: AnimationType;
  minDisplayTime?: number;
  isLoaded?: boolean;
  transitionKey?: string;
}

export default function AnimatedLoading({
  message = "Loading room...",
  timeout = 10000,
  fullHeight = false,
  onTimeout,
  animationType = "pixel-character",
  minDisplayTime = 2000,
  isLoaded = false,
  transitionKey = "loading-transition"
}: AnimatedLoadingProps) {
  // Default to the animation type provided in props, but allow for a persisted preference
  const [currentAnimation, setCurrentAnimation] = useState<AnimationType>(animationType);
  const [canTransition, setCanTransition] = useState(false);
  const [displayStartTime] = useState(Date.now());
  
  // Load the saved animation preference from localStorage on mount
  useEffect(() => {
    const savedPreference = localStorage.getItem("loadingAnimationPreference");
    if (savedPreference && ["speech-bubbles", "pixel-character", "voting", "mario-gif", "among-us-gif"].includes(savedPreference)) {
      setCurrentAnimation(savedPreference as AnimationType);
    }
  }, []);
  
  // Save the animation preference when it changes
  useEffect(() => {
    localStorage.setItem("loadingAnimationPreference", currentAnimation);
  }, [currentAnimation]);

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
  
  // Render the selected animation
  switch (currentAnimation) {
    case "speech-bubbles":
      return <LoadingView message={message} timeout={timeout} fullHeight={fullHeight} onTimeout={onTimeout} isLoaded={isLoaded} minDisplayTime={minDisplayTime} transitionKey={transitionKey} />;
    case "pixel-character":
      return <PixelLoadingView message={message} timeout={timeout} fullHeight={fullHeight} onTimeout={onTimeout} isLoaded={isLoaded} minDisplayTime={minDisplayTime} transitionKey={transitionKey} />;
    case "voting":
      return <VotingLoadingView message={message} timeout={timeout} fullHeight={fullHeight} onTimeout={onTimeout} isLoaded={isLoaded} minDisplayTime={minDisplayTime} transitionKey={transitionKey} />;
    case "mario-gif":
      return <MarioGifLoadingView message={message} timeout={timeout} fullHeight={fullHeight} onTimeout={onTimeout} isLoaded={isLoaded} minDisplayTime={minDisplayTime} transitionKey={transitionKey} />;
    case "among-us-gif":
      return <AmongUsGifLoadingView message={message} timeout={timeout} fullHeight={fullHeight} onTimeout={onTimeout} isLoaded={isLoaded} minDisplayTime={minDisplayTime} transitionKey={transitionKey} />;
    default:
      return <LoadingView message={message} timeout={timeout} fullHeight={fullHeight} onTimeout={onTimeout} isLoaded={isLoaded} minDisplayTime={minDisplayTime} transitionKey={transitionKey} />;
  }
} 