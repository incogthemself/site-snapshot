import { X, CheckCircle, Loader2, Circle } from "lucide-react";

interface ProgressModalProps {
  isOpen: boolean;
  progress: {
    progress: number;
    step: string;
    currentFile?: string;
  };
  onClose: () => void;
}

const steps = [
  { label: "Launching headless browser", threshold: 5 },
  { label: "Rendering JavaScript content", threshold: 20 },
  { label: "Downloading CSS files", threshold: 30 },
  { label: "Downloading JavaScript files", threshold: 50 },
  { label: "Downloading images", threshold: 70 },
  { label: "Rewriting URLs", threshold: 90 },
];

export default function ProgressModal({ isOpen, progress, onClose }: ProgressModalProps) {
  if (!isOpen) return null;

  const getStepStatus = (threshold: number) => {
    if (progress.progress > threshold) return "complete";
    if (progress.progress === threshold || progress.step.toLowerCase().includes(steps.find(s => s.threshold === threshold)?.label.toLowerCase() || "")) return "active";
    return "pending";
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-lg w-full border border-border">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Cloning Website</h3>
            <button className="p-1 rounded hover:bg-muted transition-all" onClick={onClose}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Progress Steps */}
          <div className="space-y-3">
            {steps.map((step, index) => {
              const status = getStepStatus(step.threshold);
              return (
                <div key={index} className="flex items-center gap-3" data-testid={`progress-step-${index}`}>
                  {status === "complete" && <CheckCircle className="w-4 h-4 text-accent" />}
                  {status === "active" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                  {status === "pending" && <Circle className="w-4 h-4 text-muted-foreground" />}
                  <span
                    className={`text-sm ${
                      status === "pending" ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="text-foreground font-medium" data-testid="text-progress-percentage">
                {Math.round(progress.progress)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>

          {/* Current File */}
          {progress.currentFile && (
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Currently processing:</p>
              <p className="text-sm font-mono text-foreground" data-testid="text-current-file">
                {progress.currentFile}
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-2">
          <button
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-all"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
