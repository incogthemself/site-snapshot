import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";
import { type Project } from "@shared/schema";

interface SitePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export default function SitePreview({ isOpen, onClose, project }: SitePreviewProps) {
  const [iframeKey, setIframeKey] = useState(0);

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  if (!project) return null;

  const previewUrl = `/api/projects/${project.id}/preview`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] w-full h-[90vh] p-0" data-testid="dialog-preview">
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
