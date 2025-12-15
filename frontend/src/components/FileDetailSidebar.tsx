import React from "react";
import { motion } from "framer-motion";
import { Download, X } from "lucide-react";

interface FileItem {
  file_id: string;
  filename: string;
  created_at: string;
  file_contents: {
    size: number;
    mime_type: string;
  };
}

interface FileDetailSidebarProps {
  file: FileItem | null;
  onClose: () => void;
}

const FileDetailSidebar: React.FC<FileDetailSidebarProps> = ({ file, onClose }) => {
  if (!file) return null;

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const handleDownload = async () => {
    if (!file) return;
    try {
      const response = await fetch(`/api/v1/files/${file.file_id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) {
        throw new Error("Network response was not ok");
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
      console.error("Download error:", error);
    }
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 h-full w-80 bg-slate-800 text-white p-6 shadow-lg z-50"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">File Details</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700">
          <X size={20} />
        </button>
      </div>
      <div>
        <p className="text-sm text-gray-400">Filename</p>
        <p className="text-lg font-semibold mb-4">{file.filename}</p>
        <p className="text-sm text-gray-400">Size</p>
        <p className="text-lg font-semibold mb-4">{formatBytes(file.file_contents.size)}</p>
        <p className="text-sm text-gray-400">MIME Type</p>
        <p className="text-lg font-semibold mb-4">{file.file_contents.mime_type}</p>
        <p className="text-sm text-gray-400">Created At</p>
        <p className="text-lg font-semibold mb-4">{new Date(file.created_at).toLocaleString()}</p>
        <button
          onClick={handleDownload}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center"
        >
          <Download size={20} className="mr-2" />
          <span>Download</span>
        </button>
      </div>
    </motion.div>
  );
};

export default FileDetailSidebar;
