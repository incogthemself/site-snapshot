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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Globe, Link2 } from "lucide-react";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cloneMethod: "static" | "playwright" | "ai";
  crawlDepth: number;
  onSave: (method: "static" | "playwright" | "ai", crawlDepth: number) => void;
}

export default function SettingsDialog({
  isOpen,
  onClose,
  cloneMethod,
  crawlDepth,
  onSave,
}: SettingsDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<"static" | "playwright" | "ai">(cloneMethod);
  const [selectedDepth, setSelectedDepth] = useState<number>(crawlDepth);

  const handleSave = () => {
    onSave(selectedMethod, selectedDepth);
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
          <RadioGroup value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as "static" | "playwright" | "ai")}>
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

          <div className="mt-6 pt-6 border-t">
            <Label className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-primary" />
              <span className="font-semibold">Crawl Sub-Pages</span>
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Clone linked pages from the main page (up to 10 sub-pages).
            </p>
            <Select 
              value={selectedDepth.toString()} 
              onValueChange={(v) => setSelectedDepth(parseInt(v))}
            >
              <SelectTrigger data-testid="select-crawl-depth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0" data-testid="option-depth-0">Single Page Only</SelectItem>
                <SelectItem value="1" data-testid="option-depth-1">Include Sub-Pages (1 level deep)</SelectItem>
              </SelectContent>
            </Select>
            {selectedDepth > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ This will increase cloning time significantly
              </p>
            )}
          </div>
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
