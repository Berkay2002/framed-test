"use client";

import { useState } from "react";
import { GameService } from "@/lib/game-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';

export default function AdminCleanup() {
  const [isLoading, setIsLoading] = useState(false);
  const [hoursValue, setHoursValue] = useState(24);
  
  const handleCleanupStaleRooms = async () => {
    if (!confirm("Are you sure you want to delete stale game rooms?")) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      await GameService.cleanupStaleRooms(hoursValue);
      toast.success("Cleanup completed successfully");
    } catch (error) {
      console.error("Cleanup error:", error);
      toast.error("Failed to complete cleanup");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Tools - Database Cleanup</h1>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cleanup Stale Game Rooms</CardTitle>
            <CardDescription>
              Remove game rooms that haven't been active for the specified amount of time.
              This will delete all associated data including players, rounds, votes, and captions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Label htmlFor="hours" className="mb-2 block">Hours (minimum age)</Label>
                  <Input
                    id="hours"
                    type="number"
                    min="1"
                    max="720"
                    value={hoursValue}
                    onChange={(e) => setHoursValue(parseInt(e.target.value) || 24)}
                  />
                </div>
                <Button 
                  onClick={handleCleanupStaleRooms}
                  disabled={isLoading}
                  variant="destructive"
                >
                  {isLoading ? "Cleaning..." : "Run Cleanup"}
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                This operation cannot be undone. Be careful with low hour values.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 