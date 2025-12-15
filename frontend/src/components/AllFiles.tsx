import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import {
  File,
  FileText,
  ImageIcon,
  FileArchive,
  FileSpreadsheet,
  Presentation,
  Search,
  LayoutGrid,
  List,
  Trash2,
  X,
  MoreVertical,
  Download,
  Share2,
  Info,
  Filter,
} from "lucide-react";
// import { toast } from "sonner"; // Import removed per user request
import { useConfirmationDialog } from "../hooks/useConfirmationDialog"; // Import useConfirmationDialog hook
import FilterPopover, { type FilterOptions } from "./FilterPopover"; // Import FilterPopover
import { formatBytes } from "../utils/formatBytes";

// --- TYPES & VARIANTS ---
interface FileItem {
  file_id: string;
  filename: string;
  created_at: string;
  file_contents: {
    size: number;
    mime_type: string;
  };
  owner_id?: string; // User ID for the file owner
  users?: { // This structure is based on the feedback provided
    username: string;
  };
}




// --- HELPER COMPONENTS & FUNCTIONS ---

// Placeholder for FileDetailSidebar
const FileDetailSidebar = ({ file, onClose }: { file: FileItem; onClose: () => void }) => {
  if (!file) return null;
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 h-full w-80 bg-gray-50/80 dark:bg-zinc-900/80 backdrop-blur-xl border-l border-gray-200 dark:border-zinc-700/80 p-6 shadow-2xl z-40"
    >
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-black dark:bg-white rounded-md flex items-center justify-center">
            <span className="text-white dark:text-black font-bold text-sm">F</span>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tighter">Flux File Vault</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
          <X size={20} className="text-zinc-600 dark:text-zinc-400" />
        </button>
      </div>
      <div className="space-y-4">
        <div className="flex justify-center my-4">{getFileIcon(file.filename, "w-24 h-24")}</div>
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Filename</p>
          <p className="text-zinc-900 dark:text-zinc-100 font-medium break-words">{file.filename}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Size</p>
          <p className="text-zinc-900 dark:text-zinc-100 font-medium">{formatBytes(file.file_contents.size)}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Date Added</p>
          <p className="text-zinc-900 dark:text-zinc-100 font-medium">{new Date(file.created_at).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">MIME Type</p>
          <p className="text-zinc-900 dark:text-zinc-100 font-medium break-words">{file.file_contents.mime_type}</p>
        </div>
      </div>
    </motion.div>
  );
};


const getFileIcon = (name: string, className: string = "w-12 h-12") => {
  const iconProps = { className: `${className} text-zinc-600 dark:text-zinc-400 group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors duration-300` };
  if (name.endsWith(".pdf")) return <FileText {...iconProps} />;
  if (name.match(/\.(png|jpg|jpeg|gif|webp)$/)) return <ImageIcon {...iconProps} />;
  if (name.endsWith(".pptx")) return <Presentation {...iconProps} />;
  if (name.endsWith(".xlsx")) return <FileSpreadsheet {...iconProps} />;
  if (name.endsWith(".zip")) return <FileArchive {...iconProps} />;
  return <File {...iconProps} />;
};

// --- Reusable Dropdown Component ---
const FileActionsDropdown = ({
  file,
  onDetails,
  onDelete,
  onShare,
  onDownload,
  onClose,
}: {
  file: FileItem;
  onDetails: (file: FileItem, e: React.MouseEvent) => void;
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
    className="absolute top-full right-0 mt-2 w-40 bg-gray-50/80 dark:bg-zinc-800/80 backdrop-blur-md border border-gray-200 dark:border-zinc-700/50 rounded-md shadow-lg z-40"
    data-dropdown-menu
  >
    <button
      onClick={(e) => {
        onDetails(file, e);
        onClose();
      }}
      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-zinc-700/50"
    >
      <Info size={14} /> Details
    </button>
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


// --- MAIN COMPONENT ---
const AllFiles = () => {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<Record<string, FileItem[]>>({}); // New state for admin view
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    min_size: "",
    max_size: "",
    mime_type: "",
    start_date: "",
    end_date: "",
  });
  const [searchTrigger, setSearchTrigger] = useState(0);
  const { openConfirmation } = useConfirmationDialog(); // Use the useConfirmationDialog hook

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
    const fetchFiles = async () => {
      const userId = localStorage.getItem("user_id");
      const isAdmin = localStorage.getItem("is_admin") === "true"; // Retrieve is_admin status

      if (!userId) {
        console.error("User ID not found in localStorage.");
        return;
      }

      let apiUrl = `/api/v1/search`; // Default API for regular users
      const params = new URLSearchParams();

      if (isAdmin) {
        apiUrl = `/api/v1/admin/files`; // Admin API
        params.append("user_id", userId); // Re-add user_id param for admin files API as per feedback
      } else {
        params.append("owner_id", userId); // Only append owner_id for non-admin users

        if (searchQuery) {
          params.append("filename", searchQuery);
        }

        const utcFilters = { ...filters };
        if (utcFilters.start_date) {
          utcFilters.start_date = new Date(utcFilters.start_date).toISOString();
        }
        if (utcFilters.end_date) {
          utcFilters.end_date = new Date(utcFilters.end_date).toISOString();
        }

        Object.entries(utcFilters).forEach(([key, value]) => {
          if (value) {
            params.append(key, value);
          }
        });
      }

      try {
        const response = await fetch(`${apiUrl}?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: FileItem[] = await response.json();
        // console.log(data);

        if (isAdmin) {
          const filesByUser: Record<string, FileItem[]> = {};
          data.forEach(file => {
            const username = file.users?.username || "Unknown User";
            if (!filesByUser[username]) {
              filesByUser[username] = [];
            }
            filesByUser[username].push(file);
          });
          setGroupedFiles(filesByUser);
          setAllFiles(data || []); // For total count and size
        } else {
          setAllFiles(data || []);
          setGroupedFiles({}); // Clear grouped files if not admin
        }
      } catch (error) {
        console.error("Failed to fetch files:", error);
        setAllFiles([]);
        setGroupedFiles({});
      }
    };

    if (searchTrigger > 0) {
      fetchFiles();
    }
  }, [searchTrigger, filters]);

  useEffect(() => {
    setSearchTrigger(1);
  }, []);

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setSearchTrigger((prev) => prev + 1);
    }
  };

  const handleSaveFilter = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    setShowFilter(false);
  };

  const handleFileClick = (file: FileItem) => {
    setSelectedFile(file);
  };

  const handleShareFile = async (file: FileItem, event: React.MouseEvent) => {
    event.stopPropagation();
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      // toast.error("You must be logged in to share files.");
      return;
    }

    try {
      const response = await fetch(`/api/v1/user/files/${file.file_id}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId, // Add X-User-ID header
        },
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
      setSearchTrigger((prev) => prev + 1); // Refresh files to show updated share status if needed
    } catch (error) {
      console.error("Error sharing file:", error);
      // if (error instanceof Error) {
      //   toast.error(`Error sharing file: ${error.message}`);
      // } else {
      //   toast.error("An unknown error occurred during file sharing.");
      // }
    }
  };

  const closeSidebar = () => setSelectedFile(null);

  // Handlers for upload, delete etc. (can be expanded)
  const handleDelete = (fileId: string, filename: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      // toast.error("You must be logged in to delete files.");
      return;
    }

    openConfirmation({
      title: "Confirm Deletion",
      message: `Are you sure you want to delete "${filename}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const response = await fetch(
            `/api/v1/files/${fileId}?user_id=${userId}`,
            {
              method: "DELETE",
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to delete file.");
          }

          // toast.success("File deleted successfully!");
          window.location.reload(); // Refresh the page to reflect changes
        } catch (error) {
          console.error("Error deleting file:", error);
          if (error instanceof Error) {
            // toast.error(`Error deleting file: ${error.message}`);
          } else {
            // toast.error("An unknown error occurred during file deletion.");
          }
        }
      },
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  };

  const handleDownload = async (file: FileItem, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await fetch(`/api/v1/files/${file.file_id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download file. Please try again later.");
    }
  };

  return (
    <div className="relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300 min-h-screen font-sans overflow-hidden">
      {/* Animated Aurora Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-gradient-to-tr from-purple-900/50 to-indigo-900/50 rounded-full blur-3xl animate-pulse-slow opacity-30"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-gradient-to-bl from-teal-900/50 to-sky-900/50 rounded-full blur-3xl animate-pulse-slow-delay opacity-30"></div>
      </div>

      <main className={`relative z-10 p-4 sm:p-6 md:p-8 flex transition-all duration-500 ${selectedFile ? "mr-80" : ""}`}>
        <div className="flex-1">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8"
          >
            <div>
              <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight .bitcount-prop-double-ink">Your Files</h1>
              <p className="text-zinc-600 dark:text-zinc-400 mt-1">{allFiles.length} items, {formatBytes(allFiles.reduce((acc, f) => acc + f.file_contents.size, 0))}</p>
            </div>
            <div className="flex items-center gap-3 mt-4 md:mt-0 w-full md:w-auto">
              <div className="relative flex-grow md:flex-grow-0">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 z-10"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Search all files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full md:w-64 bg-gray-100 dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 backdrop-blur-md text-sm rounded-md pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 transition"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className="p-2.5 rounded-md bg-gray-100 dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 backdrop-blur-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <Filter size={18} />
                </button>
                <AnimatePresence>
                  {showFilter && (
                    <FilterPopover
                      onSave={handleSaveFilter}
                      onClose={() => setShowFilter(false)}
                      initialFilters={filters}
                    />
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center bg-gray-100 dark:bg-zinc-800/40 rounded-md p-1 border border-gray-300 dark:border-zinc-700/80 backdrop-blur-md">
                <button
                  onClick={() => setView("grid")}
                  className={`p-2 rounded transition-colors ${view === "grid"
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`p-2 rounded transition-colors ${view === "list"
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </motion.header>

          {localStorage.getItem("is_admin") === "true" && Object.keys(groupedFiles).length > 0 ? (
            <div className="space-y-8">
              {Object.entries(groupedFiles).map(([username, files]) => (
                <div key={username}>
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">{username}'s Files</h2>
                  {view === "grid" ? (
                    <div
                      className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-6"
                    >
                      {files.map((file) => <FileCard key={file.file_id} file={file} onClick={handleFileClick} onDelete={handleDelete} onShare={handleShareFile} onDownload={handleDownload} openDropdownId={openDropdownId} setOpenDropdownId={setOpenDropdownId} />)}
                    </div>
                  ) : (
                    <div className="bg-gray-100 dark:bg-zinc-800/20 border border-gray-200 dark:border-zinc-700/50 rounded-xl">
                      <div className="grid grid-cols-12 gap-4 items-center px-4 py-2 h-14 border-b border-gray-200 dark:border-zinc-700/50 text-sm font-semibold text-zinc-500">
                        <div className="col-span-6">Name</div>
                        <div className="col-span-3 hidden md:block">Last Modified</div>
                        <div className="col-span-2 hidden sm:block">Size</div>
                      </div>
                      {files.map((file) => (
                        <div
                          key={file.file_id}
                          className="group grid grid-cols-12 gap-4 items-center px-4 py-2 transition-colors hover:bg-gray-200 dark:hover:bg-zinc-800/50 border border-transparent dark:border-transparent hover:border-gray-300 dark:hover:border-sky-500/50 rounded-xl"
                        >
                          <div className="col-span-11 grid grid-cols-11 items-center gap-4 cursor-pointer" onClick={() => handleFileClick(file)}>
                            <div className="col-span-6 flex items-center gap-4">
                              {getFileIcon(file.filename, "w-10 h-10")}
                              <span className="font-medium text-zinc-900 dark:text-zinc-200 truncate" title={file.filename}>{file.filename}</span>
                            </div>
                            <div className="col-span-3 text-zinc-600 dark:text-zinc-400 hidden md:block">{new Date(file.created_at).toLocaleDateString()}</div>
                            <div className="col-span-2 text-zinc-600 dark:text-zinc-400 hidden sm:block">{formatBytes(file.file_contents.size)}</div>
                          </div>
                          <div className="relative col-span-1 flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdownId(openDropdownId === file.file_id ? null : file.file_id);
                              }}
                              className="p-2 rounded-full text-zinc-500 hover:bg-gray-300 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition"
                              data-dropdown-trigger
                            >
                              <MoreVertical size={18} />
                            </button>
                            <AnimatePresence>
                              {openDropdownId === file.file_id && (
                                <FileActionsDropdown
                                  file={file}
                                  onDetails={(file, e) => { e.stopPropagation(); handleFileClick(file); }}
                                  onDelete={handleDelete}
                                  onDownload={handleDownload}
                                  onShare={handleShareFile}
                                  onClose={() => setOpenDropdownId(null)}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            view === "grid" ? (
              <div
                className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-6"
              >
                {allFiles.map((file) => <FileCard key={file.file_id} file={file} onClick={handleFileClick} onShare={handleShareFile} onDelete={handleDelete} onDownload={handleDownload} openDropdownId={openDropdownId} setOpenDropdownId={setOpenDropdownId} />)}
              </div>
            ) : (
              <div className="bg-gray-100 dark:bg-zinc-800/20 border border-gray-200 dark:border-zinc-700/50 rounded-xl">
                <div className="grid grid-cols-12 gap-4 items-center px-4 py-2 h-14 border-b border-gray-200 dark:border-zinc-700/50 text-sm font-semibold text-zinc-500">
                  <div className="col-span-6">Name</div>
                  <div className="col-span-3 hidden md:block">Last Modified</div>
                  <div className="col-span-2 hidden sm:block">Size</div>
                </div>
                {allFiles.map((file) => (
                  <div
                    key={file.file_id}
                    className="group grid grid-cols-12 gap-4 items-center px-4 py-2 transition-colors hover:bg-gray-200 dark:hover:bg-zinc-800/50 border border-transparent dark:border-transparent hover:border-gray-300 dark:hover:border-sky-500/50 rounded-xl"
                  >
                    <div className="col-span-11 grid grid-cols-11 items-center gap-4 cursor-pointer" onClick={() => handleFileClick(file)}>
                      <div className="col-span-6 flex items-center gap-4">
                        {getFileIcon(file.filename, "w-10 h-10")}
                        <span className="font-medium text-zinc-900 dark:text-zinc-200 truncate" title={file.filename}>{file.filename}</span>
                      </div>
                      <div className="col-span-3 text-zinc-600 dark:text-zinc-400 hidden md:block">{new Date(file.created_at).toLocaleDateString()}</div>
                      <div className="col-span-2 text-zinc-600 dark:text-zinc-400 hidden sm:block">{formatBytes(file.file_contents.size)}</div>
                    </div>
                    <div className="relative col-span-1 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === file.file_id ? null : file.file_id);
                        }}
                        className="p-2 rounded-full text-zinc-500 hover:bg-gray-300 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition"
                        data-dropdown-trigger
                      >
                        <MoreVertical size={18} />
                      </button>
                      <AnimatePresence>
                        {openDropdownId === file.file_id && (
                          <FileActionsDropdown
                            file={file}
                            onDetails={(file, e) => { e.stopPropagation(); handleFileClick(file); }}
                            onDelete={handleDelete}
                            onDownload={handleDownload}
                            onShare={handleShareFile}
                            onClose={() => setOpenDropdownId(null)}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      <AnimatePresence>
        {selectedFile && <FileDetailSidebar file={selectedFile} onClose={closeSidebar} />}
      </AnimatePresence>
    </div>
  );
};


// --- INTERACTIVE FILE CARD COMPONENT ---
const FileCard = ({ file, onClick, onDelete, onDownload, onShare, openDropdownId, setOpenDropdownId }: { file: FileItem; onClick: (file: FileItem, e: React.MouseEvent) => void; onDelete: (fileId: string, filename: string, e: React.MouseEvent) => void; onShare: (file: FileItem, e: React.MouseEvent) => void; onDownload: (file: FileItem, e: React.MouseEvent) => void; openDropdownId: string | null; setOpenDropdownId: (id: string | null) => void }) => {
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

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if the dropdown is open, just close it.
    if (dropdownOpen) {
      e.stopPropagation();
      setOpenDropdownId(null);
      return;
    }
    onClick(file, e);
  };

  return (
    <div
      ref={cardRef}
      key={file.file_id}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
      className="relative group bg-gray-100 dark:bg-zinc-800/20 border border-gray-200 dark:border-zinc-700/50 rounded-xl p-4 flex flex-col items-center justify-center aspect-square text-center transition-all duration-300 hover:border-gray-300 dark:hover:border-sky-500/50 hover:bg-gray-200 dark:hover:bg-zinc-800/50 cursor-pointer"
    >
      {/* Interactive Glow */}
      <div
        className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(400px at ${smoothMouseX}px ${smoothMouseY}px, rgba(14, 165, 233, 0.15), transparent 80%)`,
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center h-full w-full overflow-hidden">
        {getFileIcon(file.filename)}
        <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-200 text-center truncate w-full px-2 break-all" title={file.filename}>
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
            <FileActionsDropdown
              file={file}
              onDetails={onClick}
              onDelete={onDelete}
              onDownload={onDownload}
              onShare={onShare}
              onClose={() => setOpenDropdownId(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};


export default AllFiles;
