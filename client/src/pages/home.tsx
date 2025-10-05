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
import { Globe, Download, Settings, HelpCircle, FileCode, Code, Monitor, Eye, Zap, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null); // State to keep track of the selected project ID


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

  // Fetch projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchInterval: (query) => {
      const projects = query.state.data || [];
      const hasInProgress = projects.some(p => p.status === "processing");
      return hasInProgress ? 2000 : false;
    },
  });

  useEffect(() => {
    if (!projectsLoading && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, projectsLoading, selectedProjectId]);

  useEffect(() => {
    // Find the current project based on selectedProjectId
    setCurrentProject(projects.find((p) => p.id === selectedProjectId) || null);
  }, [projects, selectedProjectId]);


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
              setCurrentProject(updatedProject); // Ensure currentProject is updated
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
              setCurrentProject(updatedProject); // Ensure currentProject is updated
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
      setSelectedProjectId(project.id); // Set selected project ID
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


  useEffect(() => {
    if (selectedFile) {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${currentProject?.id}/files/${selectedFile.id}`] });
    }
  }, [selectedFile, currentProject?.id]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="border-b border-border bg-card px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          <h1 className="text-base sm:text-xl font-bold truncate">WebClone Studio</h1>
        </div>

        {/* URL Input Section */}
        <div className="flex-1 max-w-3xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="url"
              placeholder="Enter URL (e.g., https://example.com/page)"
              className="w-full bg-muted border border-input rounded-lg pl-10 pr-4 py-2 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClone()}
              data-testid="input-url"
            />
          </div>
          <div className="flex gap-2">
            <Select value={cloneMethod} onValueChange={(value: "static" | "playwright") => setCloneMethod(value)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="static">Static Clone</SelectItem>
                <SelectItem value="playwright">Dynamic Clone</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleClone} disabled={createProjectMutation.isPending} className="flex-1 sm:flex-none" data-testid="button-clone">
              <Download className="w-4 h-4" />
              <span className="ml-2">Clone Site</span>
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowSettings(true)} data-testid="button-settings-mobile">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
        {/* Projects Sidebar */}
        <div className={`${isMobileView ? 'w-full border-b' : 'w-64 lg:w-80 border-r'} border-border bg-card p-3 sm:p-4 overflow-y-auto flex-shrink-0`}>
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Your Projects</h2>
          {projects.length === 0 && !projectsLoading && (
            <div className="text-muted-foreground text-sm p-3 text-center">
              No projects found. Clone a website to get started.
            </div>
          )}
          {projects.map((project) => (
            <div
              key={project.id}
              className={`p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedProjectId === project.id // Use selectedProjectId for highlighting
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => {
                setSelectedProjectId(project.id); // Set selected project ID
                setSelectedFile(null); // Deselect file when project changes
                if (isMobileView) {
                  // On mobile, navigate to the workspace view
                  // This would typically involve routing or a state change to show the workspace
                  // For simplicity here, we'll assume the Tabs component handles this
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-medium truncate">{project.name}</h3>
                  <p className="text-xs text-muted-foreground truncate mt-1">{project.url}</p>
                </div>
                <div className="flex-shrink-0">
                  {project.status === "processing" && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                  {project.status === "paused" && (
                    <HelpCircle className="w-4 h-4 text-yellow-500" />
                  )}
                  {project.status === "complete" && (
                    <Eye className="w-4 h-4 text-green-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); setCurrentProject(project); setShowPreview(true); }} />
                  )}
                  {project.status === "error" && (
                    <Zap className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              {/* Optional: Display progress within the project list item */}
              {progressByProject.has(project.id) && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${progressByProject.get(project.id)?.progress || 0}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {currentProject ? ( // Check if currentProject is not null
            <>
              <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
                <TabsList className="border-b border-border rounded-none bg-card px-2 sm:px-4 flex-shrink-0">
                  <TabsTrigger value="preview" className="text-xs sm:text-sm">
                    <Eye className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Preview</span>
                  </TabsTrigger>
                  <TabsTrigger value="code" className="text-xs sm:text-sm">
                    <Code className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Code</span>
                  </TabsTrigger>
                  <TabsTrigger value="files" className="text-xs sm:text-sm">
                    <FileCode className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Files</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="flex-1 min-h-0 overflow-hidden">
                  {currentProject && (
                    <SitePreview
                      isOpen={showPreview}
                      onClose={() => setShowPreview(false)}
                      project={currentProject}
                    />
                  )}
                </TabsContent>
                <TabsContent value="code" className="flex-1 min-h-0 overflow-hidden">
                  <CodeEditor file={selectedFile} projectId={currentProject?.id} />
                </TabsContent>
                <TabsContent value="files" className="flex-1 min-h-0 overflow-hidden">
                  <FileExplorer
                    files={files}
                    currentProject={currentProject}
                    onFileSelect={(file) => {
                      setSelectedFile(file);
                      if (isMobileView) {
                        // On mobile, switch to code editor view when a file is selected
                        // This would typically involve routing or a state change
                      }
                    }}
                    onProjectSelect={setSelectedProjectId} // Pass setSelectedProjectId here
                  />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
              <div className="text-center max-w-sm">
                <Globe className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 opacity-20" />
                <p className="text-base sm:text-lg">Select a project to get started</p>
                <p className="text-xs sm:text-sm mt-2">Or clone a new website using the input above</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="bg-card border-t border-border px-2 sm:px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-xs flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto overflow-hidden">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`w-2 h-2 rounded-full ${currentProject?.status === 'processing' ? 'bg-primary animate-pulse' : currentProject?.status === 'complete' ? 'bg-green-500' : currentProject?.status === 'error' ? 'bg-red-500' : 'bg-accent'} `} />
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