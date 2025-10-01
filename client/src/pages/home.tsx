import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Project, type File as ProjectFile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import FileExplorer from "@/components/FileExplorer";
import CodeEditor from "@/components/CodeEditor";
import LivePreview from "@/components/LivePreview";
import ProgressModal from "@/components/ProgressModal";
import SuccessModal from "@/components/SuccessModal";
import { Globe, Download, Settings, HelpCircle } from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, step: "", currentFile: "" });
  const { toast } = useToast();

  // WebSocket for progress updates
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.progress === 100) {
        setTimeout(() => {
          setShowProgress(false);
          setShowSuccess(true);
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          if (currentProject) {
            queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id] });
          }
        }, 500);
      }
    };

    return () => {
      ws.close();
    };
  }, [currentProject]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: files = [] } = useQuery<ProjectFile[]>({
    queryKey: ["/api/projects", currentProject?.id, "files"],
    enabled: !!currentProject,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { url: string; name: string }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: (project: Project) => {
      setCurrentProject(project);
      setShowProgress(true);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClone = () => {
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    try {
      const urlObj = new URL(url);
      const name = `${urlObj.hostname}_${new Date().toISOString().split("T")[0]}`;
      createProjectMutation.mutate({ url, name });
    } catch {
      toast({
        title: "Error",
        description: "Invalid URL format",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <i className="fas fa-code text-primary text-xl"></i>
            <h1 className="text-lg font-bold text-foreground">WebClone Studio</h1>
          </div>
        </div>

        {/* URL Input Section */}
        <div className="flex-1 max-w-3xl flex items-center gap-2">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="url"
              placeholder="Enter website URL to clone (e.g., https://example.com)"
              className="w-full bg-muted border border-input rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClone()}
              data-testid="input-url"
            />
          </div>
          <button
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2"
            onClick={handleClone}
            disabled={createProjectMutation.isPending}
            data-testid="button-clone"
          >
            <Download className="w-4 h-4" />
            Clone Site
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-muted transition-all" title="Settings">
            <Settings className="text-muted-foreground w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg hover:bg-muted transition-all" title="Help">
            <HelpCircle className="text-muted-foreground w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <FileExplorer
          files={files}
          currentProject={currentProject}
          onFileSelect={setSelectedFile}
          onProjectSelect={setCurrentProject}
        />

        <div className="w-1 bg-border cursor-col-resize" />

        <CodeEditor file={selectedFile} projectId={currentProject?.id} />

        <div className="w-1 bg-border cursor-col-resize" />

        <LivePreview projectId={currentProject?.id} file={selectedFile} />
      </div>

      {/* Bottom Status Bar */}
      <footer className="bg-card border-t border-border px-4 py-2 flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-muted-foreground">
              {currentProject?.status === "complete" ? "Ready" : currentProject?.status || "Idle"}
            </span>
          </div>
          <span className="text-muted-foreground">
            {currentProject
              ? `Project: ${currentProject.name}`
              : "Waiting for URL input..."}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-muted-foreground" data-testid="text-file-count">
            Files: {currentProject?.totalFiles || 0}
          </span>
          <span className="text-muted-foreground" data-testid="text-size">
            Size: {currentProject ? `${((currentProject.totalSize || 0) / 1024 / 1024).toFixed(2)} MB` : "0 MB"}
          </span>
        </div>
      </footer>

      <ProgressModal
        isOpen={showProgress}
        progress={progress}
        onClose={() => setShowProgress(false)}
      />

      <SuccessModal
        isOpen={showSuccess}
        project={currentProject}
        onClose={() => setShowSuccess(false)}
      />
    </div>
  );
}
