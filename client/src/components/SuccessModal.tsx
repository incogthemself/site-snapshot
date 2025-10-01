import { type Project } from "@shared/schema";
import { CheckCircle, X, Download } from "lucide-react";

interface SuccessModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
}

export default function SuccessModal({ isOpen, project, onClose }: SuccessModalProps) {
  if (!isOpen || !project) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/projects/${project.id}/download`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const timeTaken = project.completedAt && project.createdAt
    ? ((new Date(project.completedAt).getTime() - new Date(project.createdAt).getTime()) / 1000).toFixed(1)
    : "N/A";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-md w-full border border-border">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Clone Complete!</h3>
          <p className="text-muted-foreground mb-6">
            Successfully downloaded and processed all website resources.
          </p>

          <div className="bg-muted rounded-lg p-4 mb-6 text-left">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Total Files:</span>
              <span className="text-foreground font-medium" data-testid="text-total-files">
                {project.totalFiles}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Total Size:</span>
              <span className="text-foreground font-medium" data-testid="text-total-size">
                {((project.totalSize || 0) / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Time Taken:</span>
              <span className="text-foreground font-medium" data-testid="text-time-taken">
                {timeTaken}s
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-all"
              onClick={onClose}
              data-testid="button-close-success"
            >
              Close
            </button>
            <button
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg transition-all flex items-center justify-center gap-2"
              onClick={handleDownload}
              data-testid="button-download-success"
            >
              <Download className="w-4 h-4" />
              Download ZIP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
