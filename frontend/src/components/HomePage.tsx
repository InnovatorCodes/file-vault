import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import useFileUpload from "../hooks/useFileUpload";
import {
  File,
  FileText,
  ImageIcon,
  FileArchive,
  FileSpreadsheet,
  Presentation,
  UploadCloud,
  BarChart3,
  HardDrive,
  Users,
  MoreVertical, // Added for 3-dot menu
  Download,     // Added for download action
  Share2,       // Added for share action
  Trash2,       // Added for delete action
} from "lucide-react";
import { AnimatePresence } from "framer-motion"; // Added for dropdown animations
import { toast } from "sonner";
import { formatBytes } from "../utils/formatBytes"; // Assuming you have this utility
import { useConfirmationDialog } from "../hooks/useConfirmationDialog"; // Import useConfirmationDialog hook
import { apiFetch, saveBlob, notifyFilesChanged, FILES_CHANGED_EVENT } from "../utils/api";

// --- TYPES ---
interface FileItem {
  file_id: string;
  filename: string;
  created_at: string;
  file_contents: {
    size: number;
    mime_type: string;
  };
}

interface Stats {
  total_files: number;
  total_storage_used: number;
  total_users: number; // For admin
}

// --- VARIANTS ---


// --- HELPER COMPONENTS ---
const getFileIcon = (name: string, className: string = "w-12 h-12") => {
  const iconProps = { className: `${className} text-zinc-600 dark:text-zinc-400 group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors duration-300` };
  if (name.endsWith(".pdf")) return <FileText {...iconProps} />;
  if (name.match(/\.(png|jpg|jpeg|gif|webp)$/)) return <ImageIcon {...iconProps} />;
  if (name.endsWith(".pptx")) return <Presentation {...iconProps} />;
  if (name.endsWith(".xlsx")) return <FileSpreadsheet {...iconProps} />;
  if (name.endsWith(".zip")) return <FileArchive {...iconProps} />;
  return <File {...iconProps} />;
};

const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) => (
  <div
    className="bg-gray-100/50 dark:bg-zinc-800/20 border border-gray-200 dark:border-zinc-700/50 rounded-xl p-5 flex items-center gap-5"
  >
    <div className="p-3 bg-sky-500/10 rounded-lg">{icon}</div>
    <div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  </div>
);

// --- Reusable Dropdown Component for HomePage ---
const HomeFileActionsDropdown = ({
  file,
  onDelete,
  onShare,
  onDownload,
  onClose,
}: {
  file: FileItem;
  onDelete: (fileId: string, filename: string, e: React.MouseEvent) => void;
  onShare: (file: FileItem, e: React.MouseEvent) => void;
  onDownload: (file: FileItem, e: React.MouseEvent) => void;
  onClose: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    onClick={(e) => e.stopPropagation()}
    className="absolute top-full right-0 mt-2 w-40 bg-gray-50/80 dark:bg-zinc-800/80 backdrop-blur-md border border-gray-200 dark:border-zinc-700/50 rounded-md shadow-lg z-50"
    data-dropdown-menu
  >
    <button
      onClick={(e) => {
        onDownload(file, e);
        onClose();
      }}
      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-zinc-700/50"
    >
      <Download size={14} /> Download
    </button>
    <button
      onClick={(e) => {
        onShare(file, e);
        onClose();
      }}
      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-zinc-700/50"
    >
      <Share2 size={14} /> Share
    </button>
    <button
      onClick={(e) => {
        onDelete(file.file_id, file.filename, e);
        onClose();
      }}
      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-red-400 hover:bg-red-500/10"
    >
      <Trash2 size={14} /> Delete
    </button>
  </motion.div>
);

const RecentFileCard = ({ file, openDropdownId, setOpenDropdownId }: { file: FileItem; openDropdownId: string | null; setOpenDropdownId: (id: string | null) => void }) => {
  const dropdownOpen = openDropdownId === file.file_id;
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 25, stiffness: 200 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - left - width / 2);
    mouseY.set(e.clientY - top - height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Handlers for file actions (delete, share, download)
  const { openConfirmation } = useConfirmationDialog();

  const handleDelete = (fileId: string, filename: string, event: React.MouseEvent) => {
    event.stopPropagation();
    openConfirmation({
      title: "Confirm Deletion",
      message: `Are you sure you want to delete "${filename}" ? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const response = await apiFetch(`/api/v1/files/${fileId}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to delete file.");
          }

          // toast.success("File deleted successfully!"); // Removed per user request
          notifyFilesChanged(); // Refresh recent files and stats
        } catch (error) {
          console.error("Error deleting file:", error);
          // if (error instanceof Error) {
          //   toast.error(`Error deleting file: ${error.message}`);
          // } else {
          //   toast.error("An unknown error occurred during file deletion.");
          // }
        }
      },
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  };

  const handleDownload = async (file: FileItem, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await apiFetch(`/api/v1/files/${file.file_id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      saveBlob(await response.blob(), file.filename);
    } catch (error) {
      console.error("Download failed:", error);
      // toast.error("Failed to download file. Please try again later.");
    }
  };

  const handleShareFile = async (file: FileItem, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await apiFetch(`/api/v1/user/files/${file.file_id}/share`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to share file.");
      }

      const data = await response.json();
      const shareLink = `${window.location.origin}/share/${data.share_token}`;

      navigator.clipboard.writeText(shareLink);
      // toast.success(
      //   `File sharing ${data.is_public ? "enabled" : "disabled"}! Link copied to clipboard: ${shareLink}`,
      //   {
      //     duration: 5000,
      //     action: {
      //       label: "Open Link",
      //       onClick: () => window.open(shareLink, "_blank"),
      //     },
      //   }
      // );
      // No need to refresh files here, as it's just a share status update
    } catch (error) {
      console.error("Error sharing file:", error);
      // if (error instanceof Error) {
      //   toast.error(`Error sharing file: ${error.message}`);
      // } else {
      //   toast.error("An unknown error occurred during file sharing.");
      // }
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative group bg-gray-100 dark:bg-zinc-800/20 border border-gray-200 dark:border-zinc-700/50 rounded-xl p-4 flex flex-col items-center justify-center aspect-square text-center transition-all duration-300 hover:border-gray-300 dark:hover:border-sky-500/50 hover:bg-gray-200 dark:hover:bg-zinc-800/50 cursor-pointer overflow-hidden"
    >
      <motion.div
        className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(300px at ${smoothMouseX}px ${smoothMouseY}px, rgba(14, 165, 233, 0.15), transparent 80%)`,
        }}
      />
      <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
        {getFileIcon(file.filename)}
        <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-200 text-center truncate w-full px-2" title={file.filename}>
          {file.filename}
        </p>
        <span className="text-xs text-zinc-500 mt-1">{formatBytes(file.file_contents.size)}</span>
      </div>
      <div className="absolute top-2 right-2 z-30">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenDropdownId(dropdownOpen ? null : file.file_id);
          }}
          className="p-1.5 rounded-full bg-gray-200 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 hover:bg-gray-300 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0"
          aria-label="More options"
          data-dropdown-trigger
        >
          <MoreVertical size={16} />
        </button>
        <AnimatePresence>
          {dropdownOpen && (
            <HomeFileActionsDropdown
              file={file}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onShare={handleShareFile}
              onClose={() => setOpenDropdownId(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};


// --- MAIN COMPONENT ---
const HomePage: React.FC = () => {
  const userName = localStorage.getItem("username") || "Guest";
  const isAdmin = localStorage.getItem("is_admin") === "true";
  const { ConfirmationDialog, handleFileSelect } = useFileUpload(
    (fileName) => {
      // onUploadSuccess (same messages as the sidebar's upload button)
      toast.success(`File '${fileName}' uploaded successfully!`);
    },
    (errorMessage) => {
      // onUploadError: without this, a rejected upload (quota, size, type) failed silently
      toast.error(errorMessage);
    },
    (successCount) => {
      // onAllUploadsComplete
      if (successCount > 0) {
        notifyFilesChanged(); // Refresh recent files, stats and the sidebar
      }
    }
  );
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null); // State for dropdown

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown-trigger]') && !target.closest('[data-dropdown-menu]')) {
        setOpenDropdownId(null);
      }
    };

    if (openDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdownId]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch recent files (the server returns newest first)
      try {
        const filesResponse = await apiFetch("/api/v1/search?limit=5");
        if (filesResponse.ok) {
          let filesData = await filesResponse.json();
          // Sort files by created_at in descending order
          filesData = filesData.sort((a: FileItem, b: FileItem) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          // Take only the top 5 files after sorting
          setRecentFiles(filesData.slice(0, 5) || []);
        }
      } catch (error) {
        console.error("Failed to fetch recent files:", error);
      }

      // Fetch stats
      try {
        const statsApi = isAdmin ? "/api/v1/admin/stats" : "/api/v1/stats";
        const statsResponse = await apiFetch(statsApi);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats({
            total_files: statsData.total_files,
            total_storage_used: statsData.original_storage_usage,
            total_users: statsData.total_users || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };

    fetchData();
    window.addEventListener(FILES_CHANGED_EVENT, fetchData);
    return () => window.removeEventListener(FILES_CHANGED_EVENT, fetchData);
  }, [isAdmin]);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect([file]);
    }
    e.target.value = ""; // Clear the input
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect([file]);
    }
  };

  return (
    <div className="relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300 min-h-screen font-sans overflow-hidden">
      {/* Animated Aurora Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-gradient-to-tr from-purple-900/50 to-indigo-900/50 rounded-full blur-3xl animate-pulse-slow opacity-30"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-gradient-to-bl from-teal-900/50 to-sky-900/50 rounded-full blur-3xl animate-pulse-slow-delay opacity-30"></div>
      </div>

      <main className="relative z-10 p-4 sm:p-6 md:p-8">
        <div
          className="max-w-7xl mx-auto"
        >
          {/* Header */}
          <header className="mb-10">
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Welcome back, {userName} 👋
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              Here's a quick overview of your file storage.
            </p>
          </header>

          {/* Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`bg-gray-100/80 dark:bg-zinc-900/50 backdrop-blur-md border-2 border-dashed rounded-2xl p-8 text-center mb-10 transition-colors ${isDragOver
              ? "border-sky-500 dark:border-sky-400 bg-sky-500/10"
              : "border-gray-300 dark:border-zinc-700/80 hover:border-sky-500 dark:hover:border-sky-500/80"
              }`}
          >
            <UploadCloud size={48} className="mx-auto mb-4 text-zinc-500 dark:text-zinc-400" />
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Drag & Drop files to upload
            </p>
            <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
              or click to{" "}
              <span
                className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                onClick={handleBrowseClick}
              >
                browse
              </span>
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Stats Section */}
          {stats && (
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
            >
              <StatCard
                icon={<BarChart3 className="text-sky-500 dark:text-sky-400" size={24} />}
                label="Total Files"
                value={stats?.total_files ?? 0}
              />
              <StatCard
                icon={<HardDrive className="text-sky-500 dark:text-sky-400" size={24} />}
                label="Storage Used"
                value={formatBytes(stats?.total_storage_used ?? 0)}
              />
              {isAdmin && (
                <StatCard
                  icon={<Users className="text-sky-500 dark:text-sky-400" size={24} />}
                  label="Total Users"
                  value={stats?.total_users ?? 0}
                />
              )}
            </div>
          )}

          {/* Recent Files Section */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Recent Files</h2>
          </div>

          {recentFiles.length > 0 ? (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-6"
            >
              {recentFiles.map((file) => (
                <RecentFileCard key={file.file_id} file={file} openDropdownId={openDropdownId} setOpenDropdownId={setOpenDropdownId} />
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">
              You haven't uploaded any files yet.
            </p>
          )}
        </div>
      </main>
      <ConfirmationDialog />
    </div>
  );
};

export default HomePage;
