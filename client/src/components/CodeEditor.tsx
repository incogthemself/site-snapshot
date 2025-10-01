import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type File as ProjectFile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface CodeEditorProps {
  file: ProjectFile | null;
  projectId?: string;
}

declare global {
  interface Window {
    monaco: any;
  }
}

export default function CodeEditor({ file, projectId }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoEditorRef = useRef<any>(null);
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const [openTabs, setOpenTabs] = useState<ProjectFile[]>([]);
  const { toast } = useToast();

  // Load Monaco Editor
  useEffect(() => {
    if (window.monaco) {
      setMonacoLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js";
    script.async = true;
    script.onload = () => {
      const requirejs = (window as any).require;
      requirejs.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" },
      });
      requirejs(["vs/editor/editor.main"], () => {
        setMonacoLoaded(true);
      });
    };
    script.onerror = () => {
      console.error("Failed to load Monaco Editor");
    };
    document.head.appendChild(script);
  }, []);

  // Initialize editor
  useEffect(() => {
    if (!monacoLoaded || !editorRef.current) return;

    if (!monacoEditorRef.current) {
      monacoEditorRef.current = window.monaco.editor.create(editorRef.current, {
        value: "",
        language: "html",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
      });
    }

    return () => {
      if (monacoEditorRef.current) {
        monacoEditorRef.current.dispose();
        monacoEditorRef.current = null;
      }
    };
  }, [monacoLoaded]);

  // Update editor content when file changes
  useEffect(() => {
    if (!monacoEditorRef.current || !file) return;

    const language =
      file.type === "html"
        ? "html"
        : file.type === "css"
        ? "css"
        : file.type === "js"
        ? "javascript"
        : "plaintext";

    monacoEditorRef.current.setValue(file.content || "");
    window.monaco.editor.setModelLanguage(monacoEditorRef.current.getModel(), language);

    // Add to tabs if not already there
    if (!openTabs.find((t) => t.id === file.id)) {
      setOpenTabs((prev) => [...prev, file]);
    }
  }, [file]);

  const updateFileMutation = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: string; content: string }) => {
      await apiRequest("PATCH", `/api/files/${fileId}`, { content });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File saved successfully",
      });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "files"] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!file || !monacoEditorRef.current) return;
    const content = monacoEditorRef.current.getValue();
    updateFileMutation.mutate({ fileId: file.id, content });
  };

  const closeTab = (tabFile: ProjectFile) => {
    setOpenTabs((prev) => prev.filter((t) => t.id !== tabFile.id));
  };

  const getFileIcon = (type: string) => {
    if (type === "html") return "fab fa-html5 text-orange-400";
    if (type === "css") return "fab fa-css3-alt text-blue-400";
    if (type === "js") return "fab fa-js-square text-yellow-400";
    return "far fa-file-code text-muted-foreground";
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Tabs */}
      <div className="bg-muted border-b border-border flex items-center overflow-x-auto">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer min-w-max ${
              file?.id === tab.id ? "bg-card border-b-2 border-b-primary" : ""
            }`}
            data-testid={`tab-${tab.path}`}
          >
            <i className={getFileIcon(tab.type)}></i>
            <span className="text-sm">{tab.path.split("/").pop()}</span>
            <button
              className="ml-2 hover:bg-card/50 rounded p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        {file ? (
          <div ref={editorRef} className="monaco-editor-container" data-testid="code-editor" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a file to edit
          </div>
        )}
      </div>

      {/* Editor Footer */}
      <div className="bg-muted border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{file?.type?.toUpperCase() || "TXT"}</span>
          <span>UTF-8</span>
          <span>LF</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            className="px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-all"
            onClick={handleSave}
            disabled={!file || updateFileMutation.isPending}
            data-testid="button-save"
          >
            Save (Ctrl+S)
          </button>
        </div>
      </div>
    </main>
  );
}
