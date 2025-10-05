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
import SettingsDialog from "@/components/SettingsDialog";
import EstimateDialog from "@/components/EstimateDialog";
import SitePreview from "@/components/SitePreview";
import { Globe, Download, Settings, HelpCircle, FileCode, Code, Monitor, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const [url, setUrl] = useState("");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [cloneMethod, setCloneMethod] = useState<"static" | "playwright">("static");
  const [crawlDepth, setCrawlDepth] = useState<number>(0);
  const [estimate, setEstimate] = useState<{
    estimatedTime: number;
    estimatedSize: number;
    resourceCount: number;
  } | null>(null);
  const [progressByProject, setProgressByProject] = useState<Map<string, { progress: number; step: string; currentFile: string }>>(new Map());
  const [activeClones, setActiveClones] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Get progress for current project
  const progress = currentProject 
    ? progressByProject.get(currentProject.id) || { progress: 0, step: "", currentFile: "" }
    : { progress: 0, step: "", currentFile: "" };

  // WebSocket for progress updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const { projectId, progress, step, currentFile } = data;

      // Update progress for specific project
      setProgressByProject((prev) => {
        const newMap = new Map(prev);
        newMap.set(projectId, { progress, step, currentFile });
        return newMap;
      });

      // Handle completion/error for any project (not just current)
      if (progress === 100) {
        setTimeout(() => {
          // Remove from active clones
          setActiveClones((prev) => {
            const newSet = new Set(prev);
            newSet.delete(projectId);
            return newSet;
          });

          // If this is the current project, show success modal
          if (currentProject?.id === projectId) {
            setShowProgress(false);
            setShowSuccess(true);
          } else {
            // Background clone completed - show toast notification
            toast({
              title: "Clone Completed",
              description: `Background clone finished successfully`,
            });
          }
        }, 500);
      }

      // Always invalidate queries when progress updates
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      }
    };

    return () => {
      ws.close();
    };
  }, [currentProject, queryClient]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Check for ongoing projects on load and restore progress display
  useEffect(() => {
    if (projects.length > 0) {
      const ongoingProjects = projects.filter(
        (p) => p.status === "processing" || p.status === "paused"
      );
      
      // Update active clones set
      const activeIds = new Set(ongoingProjects.map(p => p.id));
      setActiveClones(activeIds);

      // Initialize progress for all ongoing projects
      ongoingProjects.forEach((project) => {
        setProgressByProject((prev) => {
          const newMap = new Map(prev);
          if (!newMap.has(project.id)) {
            newMap.set(project.id, {
              progress: project.progressPercentage || 0,
              step: project.currentStep || "",
              currentFile: "",
            });
          }
          return newMap;
        });
      });

      // If there's an ongoing project and no current project, set it
      if (ongoingProjects.length > 0 && !currentProject) {
        setCurrentProject(ongoingProjects[0]);
        setShowProgress(true);
      }
    }
  }, [projects, currentProject]);

  // Poll for project status for ALL active clones
  useEffect(() => {
    if (activeClones.size === 0) {
      return;
    }

    const interval = setInterval(async () => {
      // Poll all active clones
      for (const projectId of Array.from(activeClones)) {
        try {
          const response = await fetch(`/api/projects/${projectId}`);
          const updatedProject = await response.json();
          
          // Update progress map
          setProgressByProject((prev) => {
            const newMap = new Map(prev);
            newMap.set(updatedProject.id, {
              progress: updatedProject.progressPercentage || 0,
              step: updatedProject.currentStep || "",
              currentFile: "",
            });
            return newMap;
          });
          
          // Handle completion/error
          if (updatedProject.status === "complete") {
            setActiveClones((prev) => {
              const newSet = new Set(prev);
              newSet.delete(updatedProject.id);
              return newSet;
            });

            if (currentProject?.id === updatedProject.id) {
              setShowProgress(false);
              setShowSuccess(true);
              setCurrentProject(updatedProject);
            } else {
              toast({
                title: "Clone Completed",
                description: `${updatedProject.name} cloned successfully`,
              });
            }
          } else if (updatedProject.status === "error") {
            setActiveClones((prev) => {
              const newSet = new Set(prev);
              newSet.delete(updatedProject.id);
              return newSet;
            });

            if (currentProject?.id === updatedProject.id) {
              setShowProgress(false);
              setCurrentProject(updatedProject);
            }

            toast({
              title: "Cloning Failed",
              description: updatedProject.errorMessage || "Unknown error occurred",
              variant: "destructive",
            });
          } else if (currentProject?.id === updatedProject.id) {
            // Update current project if still processing
            setCurrentProject(updatedProject);
          }

          // Invalidate queries
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        } catch (error) {
          console.error(`Failed to poll project ${projectId}:`, error);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeClones, currentProject, toast, queryClient]);

  const { data: files = [] } = useQuery<ProjectFile[]>({
    queryKey: ["/api/projects", currentProject?.id, "files"],
    enabled: !!currentProject,
  });

  const estimateMutation = useMutation({
    mutationFn: async (data: { url: string; cloneMethod: string; crawlDepth: number }) => {
      const res = await apiRequest("POST", "/api/estimate", data);
      return res.json();
    },
    onSuccess: (data) => {
      setEstimate(data);
      setShowEstimate(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Estimation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { url: string; name: string; cloneMethod: string; crawlDepth: number }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: (project: Project) => {
      // Add to active clones
      setActiveClones((prev) => new Set(prev).add(project.id));
      
      // Initialize progress for this project
      setProgressByProject((prev) => {
        const newMap = new Map(prev);
        newMap.set(project.id, { progress: 0, step: "Starting...", currentFile: "" });
        return newMap;
      });

      // Set as current project and show progress
      setCurrentProject(project);
      setShowProgress(true);
      setShowEstimate(false);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      
      toast({
        title: "Clone Started",
        description: `Cloning ${project.name} in the background`,
      });
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
      new URL(url);
      estimateMutation.mutate({ url, cloneMethod, crawlDepth });
    } catch {
      toast({
        title: "Error",
        description: "Invalid URL format",
        variant: "destructive",
      });
    }
  };

  const confirmClone = () => {
    try {
      const urlObj = new URL(url);
      const name = `${urlObj.hostname}_${new Date().toISOString().split("T")[0]}`;
      createProjectMutation.mutate({ url, name, cloneMethod, crawlDepth });
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
            {currentProject?.status === "complete" && (
              <button
                className="p-2 rounded-lg hover:bg-muted transition-all"
                title="Preview Site"
                onClick={() => setShowPreview(true)}
                data-testid="button-preview-mobile"
              >
                <Eye className="text-muted-foreground w-5 h-5" />
              </button>
            )}
            <button
              className="p-2 rounded-lg hover:bg-muted transition-all"
              title="Settings"
              onClick={() => setShowSettings(true)}
              data-testid="button-settings-mobile"
            >
              <Settings className="text-muted-foreground w-5 h-5" />
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
          {currentProject?.status === "complete" && (
            <button
              className="p-2 rounded-lg hover:bg-muted transition-all"
              title="Preview Site"
              onClick={() => setShowPreview(true)}
              data-testid="button-preview"
            >
              <Eye className="text-muted-foreground w-5 h-5" />
            </button>
          )}
          <button
            className="p-2 rounded-lg hover:bg-muted transition-all"
            title="Settings"
            onClick={() => setShowSettings(true)}
            data-testid="button-settings"
          >
            <Settings className="text-muted-foreground w-5 h-5" />
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

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        cloneMethod={cloneMethod}
        crawlDepth={crawlDepth}
        onSave={(method, depth) => {
          setCloneMethod(method);
          setCrawlDepth(depth);
        }}
      />

      <EstimateDialog
        isOpen={showEstimate}
        onClose={() => setShowEstimate(false)}
        onConfirm={confirmClone}
        estimate={estimate}
        cloneMethod={cloneMethod}
      />

      <SitePreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        project={currentProject}
      />
    </div>
  );
}
