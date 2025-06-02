import { useEffect, useState } from "react";

interface TimeRemainingProps {
  deadline: string;
  roundId?: string;
}

export default function TimeRemaining({ deadline, roundId }: TimeRemainingProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);
  
  useEffect(() => {
    const calculateTimeLeft = () => {
      const deadlineTime = new Date(deadline).getTime();
      const now = Date.now();
      const difference = deadlineTime - now;
      
      if (difference <= 0) {
        setIsExpired(true);
        setTimeLeft("Time's up!");
        return;
      }
      
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      
      setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    };
    
    // Calculate immediately
    calculateTimeLeft();
    
    // Update every second
    const timer = setInterval(calculateTimeLeft, 1000);
    
    return () => clearInterval(timer);
  }, [deadline, roundId]);

  
  return (
    <div className={`font-mono text-lg ${isExpired ? 'text-destructive' : 'text-primary'}`}>
      {isExpired ? (
        <span>Time's up! Voting phase starting...</span>
      ) : (
        <span>Time remaining: {timeLeft}</span>
      )}
    </div>
  );
}