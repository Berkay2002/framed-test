import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AnimationType } from "./AnimatedLoading";
import { toast } from "sonner";

interface AnimationSettingsProps {
  onClose?: () => void;
}

export default function AnimationSettings({ onClose }: AnimationSettingsProps) {
  const [selectedAnimation, setSelectedAnimation] = useState<AnimationType>("voting");
  
  // Load saved preference on mount
  useEffect(() => {
    const savedPreference = localStorage.getItem("loadingAnimationPreference");
    if (savedPreference && ["speech-bubbles", "pixel-character", "voting"].includes(savedPreference)) {
      setSelectedAnimation(savedPreference as AnimationType);
    }
  }, []);
  
  const handleSave = () => {
    localStorage.setItem("loadingAnimationPreference", selectedAnimation);
    toast.success("Loading animation preference saved!");
    if (onClose) onClose();
  };
  
  const animationOptions = [
    { 
      id: "speech-bubbles", 
      label: "Speech Bubbles", 
      description: "Character with animated speech bubbles" 
    },
    { 
      id: "pixel-character", 
      label: "Pixel Character", 
      description: "Retro pixel art animated character" 
    },
    { 
      id: "voting", 
      label: "Among Us Style", 
      description: "Voting animation inspired by social deduction games" 
    },
    {
      id: "mario-gif",
      label: "Mario GIF",
      description: "Classic Mario running pixel GIF (custom)"
    },
    {
      id: "among-us-gif",
      label: "Among Us GIF (Random)",
      description: "Random Among Us themed GIF each time"
    }
  ];
  
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Loading Animation</CardTitle>
        <CardDescription>Choose your preferred loading screen animation</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup 
          value={selectedAnimation} 
          onValueChange={(value: string) => setSelectedAnimation(value as AnimationType)}
          className="space-y-4"
        >
          {animationOptions.map((option) => (
            <div key={option.id} className="flex items-start space-x-2">
              <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor={option.id} className="font-medium">
                  {option.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
        
        <div className="flex justify-end gap-2 mt-6">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave}>
            Save Preference
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 