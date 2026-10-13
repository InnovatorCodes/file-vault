import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  File,
  FileText,
  ImageIcon,
  FileArchive,
  FileSpreadsheet,
  Presentation,
  Download,
  Copy,
  Link2Off,
} from "lucide-react";
// import { toast } from "sonner";
import { formatBytes } from "../utils/formatBytes";
import { apiFetch, saveBlob } from "../utils/api";

// --- TYPES & VARIANTS ---
interface PubliclySharedFileItem {
  share_id: string;
  file_id: string;
  filename: string;
  owner_username: string;
  mime_type: string;
  size: number;
  download_count: number;
  share_token: string;
  created_at: string;
}



// --- HELPER COMPONENTS & FUNCTIONS ---
const getFileIcon = (name: string, className: string = "w-12 h-12") => {
  const iconProps = { className: `${className} text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors duration-300` };
  if (name.endsWith(".pdf")) return <FileText {...iconProps} />;
  if (name.match(/\.(png|jpg|jpeg|gif|webp)$/)) return <ImageIcon {...iconProps} />;
  if (name.endsWith(".pptx")) return <Presentation {...iconProps} />;
  if (name.endsWith(".xlsx")) return <FileSpreadsheet {...iconProps} />;
  if (name.endsWith(".zip")) return <FileArchive {...iconProps} />;
  return <File {...iconProps} />;
};

// --- MAIN COMPONENT ---
const PubliclySharedFiles = () => {
  const [publicFiles, setPublicFiles] = useState<PubliclySharedFileItem[]>([]);
  // Removed unused 'view' and 'setView' state variables

  const fetchPubliclySharedFiles = async () => {
    try {
      const response = await apiFetch("/api/v1/user/shared-publicly");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPublicFiles(data || []);
    } catch (error) {
      console.error("Failed to fetch publicly shared files:", error);
      // toast.error("Failed to load publicly shared files.");
      setPublicFiles([]);
    }
  };

  useEffect(() => {
    fetchPubliclySharedFiles();
  }, []);

  const handleStopSharing = async (fileId: string) => {
    try {
      const response = await apiFetch(`/api/v1/user/files/${fileId}/share`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      fetchPubliclySharedFiles(); // The file drops out of the list
    } catch (error) {
      console.error("Failed to stop sharing:", error);
    }
  };

  const handleCopyShareLink = (shareToken: string) => {
    const shareLink = `${window.location.origin}/share/${shareToken}`;
    navigator.clipboard.writeText(shareLink);
    // toast.success("Share link copied to clipboard!");
  };

  const handleDownloadPublicFile = async (shareToken: string, filename: string) => {
    try {
      const response = await fetch(`/api/v1/share/${shareToken}/download`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      saveBlob(await response.blob(), filename);
      fetchPubliclySharedFiles(); // Show the new download count
      // toast.success("File downloaded successfully!");
    } catch (error) {
      console.error("Download failed:", error);
      // toast.error("Failed to download file. Please try again later.");
    }
  };

  return (
    <div className="relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300 min-h-screen font-sans overflow-hidden">
      {/* Animated Aurora Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-gradient-to-tr from-purple-900/50 to-indigo-900/50 rounded-full blur-3xl animate-pulse-slow opacity-30"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-gradient-to-bl from-teal-900/50 to-sky-900/50 rounded-full blur-3xl animate-pulse-slow-delay opacity-30"></div>
      </div>

      <main className="relative z-10 p-4 sm:p-6 md:p-8 flex">
        <div className="flex-1">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8"
          >
            <div>
              <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight .bitcount-prop-double-ink">Publicly Shared Files</h1>
              <p className="text-zinc-600 dark:text-zinc-400 mt-1">{publicFiles.length} items</p>
            </div>
          </motion.header>

          <div className="bg-gray-100 dark:bg-zinc-800/20 border border-gray-200 dark:border-zinc-700/50 rounded-xl">
            <div className="grid grid-cols-12 gap-4 items-center px-4 py-2 h-14 border-b border-gray-200 dark:border-zinc-700/50 text-sm font-semibold text-zinc-500">
              <div className="col-span-4">Name</div>
              <div className="col-span-2 hidden md:block">Owner</div>
              <div className="col-span-2 hidden sm:block">Size</div>
              <div className="col-span-2 hidden sm:block">Downloads</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {publicFiles.map((file) => (
              <div
                key={file.share_id}
                className="group grid grid-cols-12 gap-4 items-center px-4 py-2 transition-colors hover:bg-gray-200 dark:hover:bg-zinc-800/50"
              >
                <div className="col-span-4 flex items-center gap-4">
                  {getFileIcon(file.filename, "w-6 h-6")}
                  <span className="font-medium text-zinc-900 dark:text-zinc-200 truncate" title={file.filename}>{file.filename}</span>
                </div>
                <div className="col-span-2 text-zinc-600 dark:text-zinc-400 hidden md:block">{file.owner_username}</div>
                <div className="col-span-2 text-zinc-600 dark:text-zinc-400 hidden sm:block">{formatBytes(file.size)}</div>
                <div className="col-span-2 text-zinc-600 dark:text-zinc-400 hidden sm:block">{file.download_count}</div>
                <div className="col-span-2 flex justify-end gap-2">
                  <button
                    onClick={() => handleCopyShareLink(file.share_token)}
                    className="p-2 rounded-full text-zinc-500 hover:bg-gray-300 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
                    title="Copy Share Link"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    onClick={() => handleDownloadPublicFile(file.share_token, file.filename)}
                    className="p-2 rounded-full text-zinc-500 hover:bg-gray-300 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
                    title="Download File"
                  >
                    <Download size={18} />
                  </button>
                  <button
                    onClick={() => handleStopSharing(file.file_id)}
                    className="p-2 rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition"
                    title="Stop Sharing"
                  >
                    <Link2Off size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PubliclySharedFiles;
