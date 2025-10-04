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
import { Globe, Download, Settings, HelpCircle, FileCode, Code, Monitor } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

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

  // Check for ongoing projects on load and restore progress display
  useEffect(() => {
    if (projects.length > 0) {
      const ongoingProject = projects.find(
        (p) => p.status === "processing" || p.status === "paused"
      );
      if (ongoingProject) {
        setCurrentProject(ongoingProject);
        setShowProgress(true);
        setProgress({
          progress: ongoingProject.progressPercentage || 0,
          step: ongoingProject.currentStep || "",
          currentFile: "",
        });
      }
    }
  }, [projects]);

  // Poll for project status when there's an ongoing project
  useEffect(() => {
    if (!currentProject || (currentProject.status !== "processing" && currentProject.status !== "paused")) {
      return;
    }

    const interval = setInterval(async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id] });
      
      const response = await fetch(`/api/projects/${currentProject.id}`);
      const updatedProject = await response.json();
      
      // Update the current project reference with the latest status
      setCurrentProject(updatedProject);
      
      if (updatedProject.status === "complete") {
        setShowProgress(false);
        setShowSuccess(true);
        clearInterval(interval);
      } else if (updatedProject.status === "error") {
        setShowProgress(false);
        toast({
          title: "Cloning Failed",
          description: updatedProject.errorMessage || "Unknown error occurred",
          variant: "destructive",
        });
        clearInterval(interval);
      } else {
        setProgress({
          progress: updatedProject.progressPercentage || 0,
          step: updatedProject.currentStep || "",
          currentFile: "",
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentProject, toast]);

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
      <header className="bg-card border-b border-border px-2 sm:px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <i className="fas fa-code text-primary text-xl"></i>
            <h1 className="text-base sm:text-lg font-bold text-foreground">WebClone Studio</h1>
          </div>
          <div className="flex items-center gap-2 ml-auto sm:hidden">
            <button className="p-2 rounded-lg hover:bg-muted transition-all" title="Settings">
              <Settings className="text-muted-foreground w-5 h-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-all" title="Help">
              <HelpCircle className="text-muted-foreground w-5 h-5" />
            </button>
          </div>
        </div>

        {/* URL Input Section */}
        <div className="flex-1 w-full sm:max-w-3xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="url"
              placeholder="Enter URL (e.g., https://example.com/page)"
              className="w-full bg-muted border border-input rounded-lg pl-10 pr-4 py-2.5 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClone()}
              data-testid="input-url"
            />
          </div>
          <button
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 sm:px-6 py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
            onClick={handleClone}
            disabled={createProjectMutation.isPending}
            data-testid="button-clone"
          >
            <Download className="w-4 h-4" />
            Clone Site
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-muted transition-all" title="Settings">
            <Settings className="text-muted-foreground w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg hover:bg-muted transition-all" title="Help">
            <HelpCircle className="text-muted-foreground w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {/* Mobile: Tabs Layout */}
      <div className="flex-1 flex lg:hidden overflow-hidden">
        <Tabs defaultValue="files" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-card border-b border-border rounded-none h-12">
            <TabsTrigger value="files" className="flex items-center gap-2 data-[state=active]:bg-muted">
              <FileCode className="w-4 h-4" />
              <span className="hidden sm:inline">Files</span>
            </TabsTrigger>
            <TabsTrigger value="editor" className="flex items-center gap-2 data-[state=active]:bg-muted">
              <Code className="w-4 h-4" />
              <span className="hidden sm:inline">Editor</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2 data-[state=active]:bg-muted">
              <Monitor className="w-4 h-4" />
              <span className="hidden sm:inline">Preview</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="files" className="flex-1 overflow-hidden mt-0">
            <FileExplorer
              files={files}
              currentProject={currentProject}
              onFileSelect={setSelectedFile}
              onProjectSelect={setCurrentProject}
            />
          </TabsContent>
          <TabsContent value="editor" className="flex-1 overflow-hidden mt-0">
            <CodeEditor file={selectedFile} projectId={currentProject?.id} />
          </TabsContent>
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
            <LivePreview projectId={currentProject?.id} file={selectedFile} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: Side-by-Side Layout */}
      <div className="flex-1 hidden lg:flex overflow-hidden">
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
      <footer className="bg-card border-t border-border px-2 sm:px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-xs flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto overflow-hidden">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-muted-foreground">
              {currentProject?.status === "complete" ? "Ready" : currentProject?.status || "Idle"}
            </span>
          </div>
          <span className="text-muted-foreground truncate">
            {currentProject
              ? `Project: ${currentProject.name}`
              : "Waiting for URL input..."}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
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
        projectId={currentProject?.id}
        projectStatus={currentProject?.status}
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
