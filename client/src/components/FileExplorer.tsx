import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Project, type File as ProjectFile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Image,
  ChevronRight,
  ChevronDown,
  Play,
  Download,
  RefreshCw,
} from "lucide-react";

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
  file?: ProjectFile;
}

interface FileExplorerProps {
  files: ProjectFile[];
  currentProject: Project | null;
  onFileSelect: (file: ProjectFile) => void;
  onProjectSelect: (project: Project | null) => void;
}

export default function FileExplorer({
  files,
  currentProject,
  onFileSelect,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));
  const [selectedPath, setSelectedPath] = useState<string>("");
  const { toast } = useToast();

  const downloadMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/projects/${projectId}/download`);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentProject?.name || "project"}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Project downloaded successfully",
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

  const buildFileTree = (files: ProjectFile[]): FileTreeNode => {
    const root: FileTreeNode = {
      name: currentProject?.name || "Project",
      path: "root",
      type: "folder",
      children: [],
    };

    files.forEach((file) => {
      const parts = file.path.split("/");
      let current = root;

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const path = parts.slice(0, index + 1).join("/");

        let child = current.children?.find((c) => c.name === part);

        if (!child) {
          child = {
            name: part,
            path,
            type: isFile ? "file" : "folder",
            children: isFile ? undefined : [],
            file: isFile ? file : undefined,
          };
          current.children?.push(child);
        }

        if (!isFile) {
          current = child;
        }
      });
    });

    return root;
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = (node: FileTreeNode) => {
    if (node.type === "folder") {
      toggleFolder(node.path);
    } else if (node.file) {
      setSelectedPath(node.path);
      onFileSelect(node.file);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["html", "htm"].includes(ext || "")) return <FileCode className="w-4 h-4 text-orange-400" />;
    if (["css"].includes(ext || "")) return <FileText className="w-4 h-4 text-blue-400" />;
    if (["js", "json"].includes(ext || "")) return <FileText className="w-4 h-4 text-yellow-400" />;
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || ""))
      return <Image className="w-4 h-4 text-green-400" />;
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  const renderNode = (node: FileTreeNode, depth: number = 0): JSX.Element => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <div
          className={`file-item flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
            isSelected ? "bg-muted" : ""
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileClick(node)}
          data-testid={`file-item-${node.name}`}
        >
          {node.type === "folder" && (
            <>
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-accent" />
              ) : (
                <Folder className="w-4 h-4 text-accent" />
              )}
            </>
          )}
          {node.type === "file" && getFileIcon(node.name)}
          <span className="text-sm">{node.name}</span>
        </div>
        {node.type === "folder" && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const fileTree = buildFileTree(files);

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">FILES</h2>
        <button
          className="p-1 rounded hover:bg-muted transition-all"
          title="Refresh"
          onClick={() => {
            if (currentProject) {
              queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id, "files"] });
            }
          }}
        >
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {currentProject ? (
          renderNode(fileTree)
        ) : (
          <div className="text-sm text-muted-foreground text-center mt-8">
            Clone a website to view files
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border space-y-2">
        <button
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
          disabled={!currentProject}
          data-testid="button-run-preview"
        >
          <Play className="w-4 h-4" />
          Run Preview
        </button>
        <button
          className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
          onClick={() => currentProject && downloadMutation.mutate(currentProject.id)}
          disabled={!currentProject || downloadMutation.isPending}
          data-testid="button-download-zip"
        >
          <Download className="w-4 h-4" />
          Download ZIP
        </button>
      </div>
    </aside>
  );
}
