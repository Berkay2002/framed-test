import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOutIcon } from "lucide-react";

interface LeaveRoomConfirmationProps {
  isHost: boolean;
  isLastPlayer: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export default function LeaveRoomConfirmation({
  isHost,
  isLastPlayer,
  onConfirm,
  onCancel
}: LeaveRoomConfirmationProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleConfirm = async () => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      await onConfirm();
      // Only reach here if onConfirm was successful
    } catch (error) {
      console.error("Error in leave confirmation:", error);
      setIsLoading(false);
    }
  };
  
  return (
    <div className="flex items-center justify-center  ">
      <div className="rounded-lg">
        <h3 className="text-xl font-bold text-white mb-4">Leave Game</h3>
        
        <p className="text-gray-200 mb-4">
          Are you sure you want to leave this game room?
        </p>
        
        {isLastPlayer && isHost && (
          <div className="bg-[#4d3f68]/50 p-3 rounded-md mb-4">
            <p className="text-amber-200 text-sm">
              You are the only player in this room. The room will be closed if you leave.
            </p>
          </div>
        )}
        
        {isHost && !isLastPlayer && (
          <div className="bg-[#4d3f68]/50 p-3 rounded-md mb-4">
            <p className="text-amber-200 text-sm">
              You are the host. Host status will be transferred to another player if you leave.
            </p>
          </div>
        )}
        
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 bg-transparent text-white border border-gray-600 rounded hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                Leaving...
              </>
            ) : (
              "Leave Game"
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 