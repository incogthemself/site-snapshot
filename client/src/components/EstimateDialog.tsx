import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, HardDrive, FileText } from "lucide-react";

interface EstimateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  estimate: {
    estimatedTime: number;
    estimatedSize: number;
    resourceCount: number;
  } | null;
  cloneMethod: "static" | "playwright";
}

export default function EstimateDialog({
  isOpen,
  onClose,
  onConfirm,
  estimate,
  cloneMethod,
}: EstimateDialogProps) {
  if (!estimate) return null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]" data-testid="dialog-estimate">
        <DialogHeader>
          <DialogTitle>Clone Estimation</DialogTitle>
          <DialogDescription>
            Here's what to expect for this clone ({cloneMethod} mode)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Clock className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">Estimated Time</div>
              <div className="text-lg font-semibold" data-testid="text-estimated-time">
                {formatTime(estimate.estimatedTime)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <HardDrive className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">Estimated ZIP Size</div>
              <div className="text-lg font-semibold" data-testid="text-estimated-size">
                {formatSize(estimate.estimatedSize)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <FileText className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">Resources Found</div>
              <div className="text-lg font-semibold" data-testid="text-resource-count">
                {estimate.resourceCount} files
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-estimate">
            Cancel
          </Button>
          <Button onClick={onConfirm} data-testid="button-confirm-clone">
            Start Cloning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
