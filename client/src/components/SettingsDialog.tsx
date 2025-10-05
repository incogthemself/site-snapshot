import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Zap, Globe } from "lucide-react";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cloneMethod: "static" | "playwright";
  onSave: (method: "static" | "playwright") => void;
}

export default function SettingsDialog({
  isOpen,
  onClose,
  cloneMethod,
  onSave,
}: SettingsDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<"static" | "playwright">(cloneMethod);

  const handleSave = () => {
    onSave(selectedMethod);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-settings">
        <DialogHeader>
          <DialogTitle>Clone Settings</DialogTitle>
          <DialogDescription>
            Choose how you want to clone websites. This affects speed and accuracy.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as "static" | "playwright")}>
            <div className="flex items-start space-x-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50" onClick={() => setSelectedMethod("static")}>
              <RadioGroupItem value="static" id="static" data-testid="radio-static" />
              <div className="flex-1">
                <Label htmlFor="static" className="flex items-center gap-2 cursor-pointer">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-semibold">Static Mirror (Recommended)</span>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Fast cloning that captures the HTML as-is. Best for most websites. Does not execute JavaScript.
                </p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>⚡ 2-3x faster</span>
                  <span>📦 Smaller file size</span>
                  <span>✅ No browser needed</span>
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 mt-3" onClick={() => setSelectedMethod("playwright")}>
              <RadioGroupItem value="playwright" id="playwright" data-testid="radio-playwright" />
              <div className="flex-1">
                <Label htmlFor="playwright" className="flex items-center gap-2 cursor-pointer">
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="font-semibold">Dynamic Clone (Playwright)</span>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Uses a headless browser to execute JavaScript before cloning. Best for JavaScript-heavy sites.
                </p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>🐢 Slower process</span>
                  <span>🎯 Captures JS-rendered content</span>
                  <span>⚠️ Requires browser</span>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-settings">
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
