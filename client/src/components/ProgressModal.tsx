import { X, CheckCircle, Loader2, Circle, Pause, Play } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProgressModalProps {
  isOpen: boolean;
  progress: {
    progress: number;
    step: string;
    currentFile?: string;
    generatedCode?: string;
    deviceProfile?: string;
  };
  projectId?: string;
  projectStatus?: string;
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

export default function ProgressModal({ isOpen, progress, projectId, projectStatus, onClose }: ProgressModalProps) {
  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      const res = await apiRequest("POST", `/api/projects/${projectId}/pause`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      const res = await apiRequest("POST", `/api/projects/${projectId}/resume`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }
    },
  });

  if (!isOpen) return null;

  const getStepStatus = (threshold: number) => {
    if (progress.progress > threshold) return "complete";
    if (progress.progress === threshold || progress.step.toLowerCase().includes(steps.find(s => s.threshold === threshold)?.label.toLowerCase() || "")) return "active";
    return "pending";
  };

  const isPaused = projectStatus === "paused";

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
          {progress.currentFile && !progress.generatedCode && (
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Currently processing:</p>
              <p className="text-sm font-mono text-foreground" data-testid="text-current-file">
                {progress.currentFile}
              </p>
            </div>
          )}

          {/* AI Generated Code Display */}
          {progress.generatedCode && (
            <div className="bg-muted rounded-lg p-3 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">
                  {progress.deviceProfile ? `Generating code for ${progress.deviceProfile}...` : 'AI generating code...'}
                </p>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                  <span className="text-xs text-accent">Live</span>
                </div>
              </div>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words" data-testid="text-generated-code">
                {progress.generatedCode}
              </pre>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-between items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {isPaused && (
              <span className="flex items-center gap-2 text-amber-500">
                <Pause className="w-4 h-4" />
                Paused - You can navigate away and resume later
              </span>
            )}
            {!isPaused && projectStatus === "processing" && (
              <span className="text-muted-foreground">
                Background cloning in progress...
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {projectId && !isPaused && projectStatus === "processing" && (
              <button
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all flex items-center gap-2"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                data-testid="button-pause"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
            {projectId && isPaused && (
              <button
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg transition-all flex items-center gap-2"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                data-testid="button-resume"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}
            <button
              className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-all"
              onClick={onClose}
              data-testid="button-close-progress"
            >
              {isPaused ? "Close" : "Minimize"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
