"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TestPage() {
  const [userId, setUserId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addResult = (result: any) => {
    setResults(prev => [result, ...prev]);
  };

  const callEdgeFunction = async (action: string, params = {}) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/test-edge-functions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          userId: userId || undefined,
          roomCode: roomCode || undefined,
          roomId: roomId || undefined,
          playerId: playerId || undefined,
          ...params,
        }),
      });

      const result = await response.json();
      addResult({ action, result, timestamp: new Date().toISOString() });

      // If we get back a room or player, automatically update our form fields
      if (result.room) {
        setRoomCode(result.room.code);
        setRoomId(result.room.id);
      }
      if (result.player) {
        setPlayerId(result.player.id);
      }

      return result;
    } catch (error: any) {
      addResult({ action, error: error.message, timestamp: new Date().toISOString() });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRoom = () => callEdgeFunction("create_room");
  const handleJoinRoom = () => callEdgeFunction("join_room");
  const handleStartGame = () => callEdgeFunction("start_game");
  const handleHeartbeat = () => callEdgeFunction("heartbeat");
  const handleLeaveRoom = (forceDelete: boolean) => 
    callEdgeFunction("leave_room", { forceDelete });

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Edge Function Tester</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold">Test Parameters</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium">User ID (optional)</label>
            <Input 
              value={userId} 
              onChange={(e) => setUserId(e.target.value)} 
              placeholder="Leave empty to use authenticated user" 
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Room Code</label>
            <Input 
              value={roomCode} 
              onChange={(e) => setRoomCode(e.target.value)} 
              placeholder="e.g. ABC123" 
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Room ID</label>
            <Input 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)} 
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000" 
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Player ID</label>
            <Input 
              value={playerId} 
              onChange={(e) => setPlayerId(e.target.value)} 
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000" 
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button 
              onClick={handleCreateRoom} 
              disabled={isLoading}
              className="w-full"
            >
              Create Room
            </Button>
            <Button 
              onClick={handleJoinRoom} 
              disabled={isLoading || !roomCode}
              className="w-full"
            >
              Join Room
            </Button>
            <Button 
              onClick={handleStartGame} 
              disabled={isLoading || !roomId}
              className="w-full"
            >
              Start Game
            </Button>
            <Button 
              onClick={handleHeartbeat} 
              disabled={isLoading || !playerId}
              className="w-full"
            >
              Send Heartbeat
            </Button>
            <Button 
              onClick={() => handleLeaveRoom(false)} 
              disabled={isLoading || !playerId}
              variant="secondary"
              className="w-full"
            >
              Go Offline
            </Button>
            <Button 
              onClick={() => handleLeaveRoom(true)} 
              disabled={isLoading || !playerId}
              variant="destructive"
              className="w-full"
            >
              Leave Room
            </Button>
          </div>
        </div>

        <div className="space-y-4 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold">Test Results</h2>
          
          <div className="h-[500px] overflow-y-auto border rounded-md p-2 bg-slate-50 dark:bg-slate-900 font-mono text-sm">
            {results.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                No results yet. Run a test to see results.
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((result, i) => (
                  <div key={i} className="border-b pb-2 last:border-b-0">
                    <div className="font-bold text-xs mb-1">
                      {result.action} - {new Date(result.timestamp).toLocaleTimeString()}
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-xs">
                      {JSON.stringify(result.result || result.error, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 