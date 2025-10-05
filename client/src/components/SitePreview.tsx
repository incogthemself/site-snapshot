import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { type Project } from "@shared/schema";

interface SitePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export default function SitePreview({ isOpen, onClose, project }: SitePreviewProps) {
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isFullscreen]);

  if (!project) return null;

  const previewUrl = `/api/projects/${project.id}/preview`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={`w-full p-0 ${isFullscreen ? 'max-w-none h-screen' : 'max-w-[90vw] h-[90vh]'}`} 
        data-testid="dialog-preview"
      >
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle>Preview: {project.name}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                data-testid="button-refresh-preview"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
                data-testid="button-fullscreen-preview"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-4 h-4 mr-2" />
                    Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 mr-2" />
                    Fullscreen
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewUrl, "_blank")}
                data-testid="button-open-preview"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in New Tab
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden">
          <iframe
            key={iframeKey}
            src={previewUrl}
            className="w-full h-full border-0"
            title={`Preview of ${project.name}`}
            sandbox="allow-same-origin allow-scripts allow-forms"
            data-testid="iframe-preview"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
