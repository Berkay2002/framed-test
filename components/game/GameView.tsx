import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { GameRoom } from "@/lib/game-service";
import RoomHeader from "./RoomHeader";

import Image from "next/image"
import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from "react";


interface GameViewProps {
  currentRoom: GameRoom;
  players: any[];
  onLeaveRoom: () => Promise<{ canceled?: boolean; error?: boolean } | unknown>;
}

export default function GameView({ 
  currentRoom, 
  players, 
  onLeaveRoom 
}: GameViewProps) {
    // State to store the image URL
    const [imageUrl, setImageUrl] = useState<string>('');
    // Image title 
    const [imageTitle, setImageTitle] = useState<string>('');
    //file name
    const [imageName, setImageName] = useState<string>('');
    //category
    const [imageCategory, setImageCategory] = useState<string>('');
    // State for potential errors
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
      const fetchImage = async () => {
        setImageUrl('');
        setError(null);

        try{
        //get round metadata () from the api (not used)
        const metaRes = await fetch(
          `/api/round-meta?gameId=${currentRoom.id}&round=${currentRoom.current_round}`
        );
        if(!metaRes.ok) throw new Error("Failed to fetch round metadata :((");

        ////////////////////////////////////////////////////////

        const imageRes = await fetch(
          `/api/round-image-url?key=${currentRoom.id}`
        );

        //console.log('imageRes:', imageRes.json);

        if(!imageRes.ok) {
          let errorDetails = `Status: ${imageRes.status}`;
          try{
            const errorJson = await imageRes.json();
            errorDetails += `, Message: ${errorJson || "Unknown API error"}`;
          } catch(err){}
          throw new Error(`Failed to fetch image URL -- ${errorDetails}`);
        } 

        
        //extract url and title from resposnse
        const { url, title, file_name, category} = await imageRes.json();
        
        console.log("file URL:", url);
        console.log("title:", title);
        console.log("file_name:", file_name);
        console.log("category:", category);
        
        if(!url) throw new Error("API did not return a valid image URL");

        // Use the URL directly without any modifications
        console.log("Using image URL directly:", url);
        
        //verify image loads correctly
        const img = new window.Image();
        img.src = url;
        img.title = file_name;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error("Error failed to load from the provided URL ://"));
        });

        setImageUrl(url);
        setImageTitle(title || 'Unfortunately, Could not find Image');
        setImageName(file_name || 'Image name not found');
        setImageCategory(category || 'Category unknown');

      }catch(err: any){
        console.log("Error: ", err);
        setError(err.message);
        toast.error(err.message);
      }

      }; //fetch image end

      //
      if(currentRoom?.id && currentRoom.current_round){
        fetchImage();
      }
    }, [currentRoom, currentRoom.current_round]); //useEffect end


  return (
    <div className="max-w-6xl mx-auto py-8 px-4 bg-background min-h-screen">
      <RoomHeader 
        currentRoom={currentRoom} 
        players={players} 
        isGameInProgress={true} 
        currentRound={currentRoom.current_round || undefined}
        onLeaveRoom={onLeaveRoom}
      />
      
      {/* Game content will go here */}
      <Card className="mb-8">
        <CardContent className="p-8">
          <div className="flex flex-col items-center">
            {error && <p className="text-red-500">{error}</p>}
            {!error && imageUrl && (
              <>
                <Image src={imageUrl} width={500} height={500} alt={imageName || "Game Image"} priority/>
                {imageTitle && (
                  <>
                    <h2 className="text-xl text-foreground text-center font-medium">{imageTitle}</h2>
                    {imageCategory && (
                      <h4 className="text-base text-foreground text-center font-medium">Category: {imageCategory}</h4>
                    )}
                  </>
                )}
              </>
            )}
            <h1 className="text-2xl text-foreground text-center"> This is the best album of all time.</h1>
            <p className="text-lg text-foreground text-center">Game interface under development...</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Debug information (always visible for testing) */}
      <Card className="mb-8 border-dashed border-yellow-500">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-2">Debug Info:</h3>
          <div className="text-xs font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto max-h-48">
            <p>Room ID: {currentRoom.id}</p>
            <p>Room Status: {currentRoom.status}</p>
            <p>Current Round: {currentRoom.current_round}</p>
            <p>Image Loading: {imageUrl ? 'Yes' : 'No'}</p>
            <p>Error: {error || 'None'}</p>
            <p>Players: {players.length}</p>
            {currentRoom.impostor_id && (
              <>
                <p>Impostor ID: {currentRoom.impostor_id}</p>
                <p>Impostor: {players.find(player => player.user_id === currentRoom.impostor_id)?.game_alias || 'Unknown'}</p>
              </>
            )}
            <p>Image URL: {imageUrl || 'Not loaded'}</p>
            <p>API Status: {error ? 'Error' : imageUrl ? 'Success' : 'Loading'}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-2 py-1 bg-blue-500 text-white rounded mt-2 text-xs"
            >
              Reload Page
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 