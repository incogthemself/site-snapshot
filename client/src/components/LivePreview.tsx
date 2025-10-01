import { useQuery } from "@tanstack/react-query";
import { type File as ProjectFile } from "@shared/schema";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  RefreshCw,
} from "lucide-react";

interface LivePreviewProps {
  projectId?: string;
  file: ProjectFile | null;
}

export default function LivePreview({ projectId, file }: LivePreviewProps) {
  const [iframeKey, setIframeKey] = useState(0);
  const [viewportMode, setViewportMode] = useState<"mobile" | "tablet" | "desktop">("desktop");

  const { data: files = [] } = useQuery<ProjectFile[]>({
    queryKey: ["/api/projects", projectId, "files"],
    enabled: !!projectId,
  });

  const indexFile = files.find((f) => f.path === "index.html");

  useEffect(() => {
    if (file) {
      setIframeKey((prev) => prev + 1);
    }
  }, [file?.content]);

  const getViewportWidth = () => {
    switch (viewportMode) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      default:
        return "100%";
    }
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <aside className="w-96 bg-card border-l border-border flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">PREVIEW</h2>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-muted transition-all"
            title="Refresh"
            onClick={handleRefresh}
            data-testid="button-refresh-preview"
          >
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
          <button className="p-1 rounded hover:bg-muted transition-all" title="Open in new window">
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Browser Controls */}
      <div className="px-3 py-2 bg-muted border-b border-border flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button className="w-6 h-6 rounded hover:bg-card transition-all flex items-center justify-center">
            <ArrowLeft className="w-3 h-3 text-muted-foreground" />
          </button>
          <button className="w-6 h-6 rounded hover:bg-card transition-all flex items-center justify-center">
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
          </button>
          <button className="w-6 h-6 rounded hover:bg-card transition-all flex items-center justify-center">
            <RotateCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 bg-card rounded px-2 py-1 text-xs text-muted-foreground flex items-center gap-2">
          <Lock className="w-3 h-3" />
          <span>localhost:5000/preview</span>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex-1 p-3 overflow-auto">
        <div
          className="bg-white rounded-lg shadow-lg overflow-hidden mx-auto transition-all"
          style={{ width: getViewportWidth(), minHeight: "400px" }}
        >
          {indexFile ? (
            <iframe
              key={iframeKey}
              srcDoc={indexFile.content || ""}
              className="w-full h-full min-h-[600px] border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
              data-testid="preview-iframe"
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Clone a website to see preview
            </div>
          )}
        </div>
      </div>

      {/* Preview Controls */}
      <div className="p-3 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className={`p-2 rounded transition-all ${
              viewportMode === "mobile" ? "bg-muted text-primary" : "hover:bg-muted"
            }`}
            title="Mobile view"
            onClick={() => setViewportMode("mobile")}
            data-testid="button-mobile-view"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button
            className={`p-2 rounded transition-all ${
              viewportMode === "tablet" ? "bg-muted text-primary" : "hover:bg-muted"
            }`}
            title="Tablet view"
            onClick={() => setViewportMode("tablet")}
            data-testid="button-tablet-view"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            className={`p-2 rounded transition-all ${
              viewportMode === "desktop" ? "bg-muted text-primary" : "hover:bg-muted"
            }`}
            title="Desktop view"
            onClick={() => setViewportMode("desktop")}
            data-testid="button-desktop-view"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {viewportMode === "desktop" ? "1920 × 1080" : viewportMode === "tablet" ? "768 × 1024" : "375 × 667"}
        </span>
      </div>
    </aside>
  );
}
