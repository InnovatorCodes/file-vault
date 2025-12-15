import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
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
} from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "../utils/formatBytes";

interface PublicShareDetails {
  file_id: string;
  filename: string;
  mime_type: string;
  size: number;
  download_count: number;
  owner_username: string;
  created_at: string;
}

const getFileIcon = (name: string, className: string = "w-16 h-16") => {
  const iconProps = { className: `${className} text-zinc-600 dark:text-zinc-400` };
  if (name.endsWith(".pdf")) return <FileText {...iconProps} />;
  if (name.match(/\.(png|jpg|jpeg|gif|webp)$/)) return <ImageIcon {...iconProps} />;
  if (name.endsWith(".pptx")) return <Presentation {...iconProps} />;
  if (name.endsWith(".xlsx")) return <FileSpreadsheet {...iconProps} />;
  if (name.endsWith(".zip")) return <FileArchive {...iconProps} />;
  return <File {...iconProps} />;
};

const PublicShareView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [fileDetails, setFileDetails] = useState<PublicShareDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFileDetails = async () => {
      if (!token) {
        setError("Share token is missing.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`http://localhost:8080/share/${token}`); // Explicitly target backend
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data: PublicShareDetails = await response.json();
        setFileDetails(data);
      } catch (err) {
        console.error("Failed to fetch public share details:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchFileDetails();
  }, [token]);

  const handleDownload = async () => {
    if (!token || !fileDetails) return;

    try {
      const response = await fetch(`http://localhost:8080/share/${token}/download`); // Explicitly target backend
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileDetails.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("File downloaded successfully!");
    } catch (err) {
      console.error("Download failed:", err);
      if (err instanceof Error) {
        toast.error(`Failed to download file: ${err.message}`);
      } else {
        toast.error("Failed to download file. Please try again later.");
      }
    }
  };

  const handleCopyLink = () => {
    if (!token) return;
    const shareLink = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(shareLink);
    toast.success("Share link copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300">
        <p>Loading file details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-zinc-950 text-red-500">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!fileDetails) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300">
        <p>File not found or not publicly shared.</p>
      </div>
    );
  }

  return (
    <div className="relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300 min-h-screen font-sans flex items-center justify-center p-4">
      {/* Animated Aurora Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-gradient-to-tr from-purple-900/50 to-indigo-900/50 rounded-full blur-3xl animate-pulse-slow opacity-30"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-gradient-to-bl from-teal-900/50 to-sky-900/50 rounded-full blur-3xl animate-pulse-slow-delay opacity-30"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 bg-gray-100 dark:bg-zinc-800/40 backdrop-blur-md border border-gray-200 dark:border-zinc-700/80 rounded-xl shadow-lg p-8 max-w-2xl w-full text-center"
      >
        <div className="flex justify-center mb-6">
          {getFileIcon(fileDetails.filename, "w-24 h-24")}
        </div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 break-words">
          {fileDetails.filename}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          Shared by <span className="font-medium">{fileDetails.owner_username}</span> on{" "}
          {new Date(fileDetails.created_at).toLocaleDateString()}
        </p>

        <div className="grid grid-cols-2 gap-4 text-left mb-8">
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Size</p>
            <p className="text-zinc-900 dark:text-zinc-100 font-medium">
              {formatBytes(fileDetails.size)}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">MIME Type</p>
            <p className="text-zinc-900 dark:text-zinc-100 font-medium break-words">
              {fileDetails.mime_type}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Downloads</p>
            <p className="text-zinc-900 dark:text-zinc-100 font-medium">
              {fileDetails.download_count}
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownload}
            className="flex items-center gap-2 bg-zinc-900 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-black/20"
          >
            <Download size={20} /> Download File
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopyLink}
            className="flex items-center gap-2 bg-gray-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200 font-semibold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-black/10"
          >
            <Copy size={20} /> Copy Link
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default PublicShareView;
