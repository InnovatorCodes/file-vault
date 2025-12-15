import React, { useCallback } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import useFileUpload from "../hooks/useFileUpload";
import { Toaster, toast } from "sonner"; // Import Toaster and toast from sonner
import Loader from "./Loader";

const Layout: React.FC = () => {
  const handleUploadSuccess = useCallback((fileName: string) => {
    toast.success(`File '${fileName}' uploaded successfully!`);
  }, []);

  const handleUploadError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  const handleAllUploadsComplete = useCallback((successCount: number, errorCount: number) => {
    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} file(s) uploaded successfully!`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`${successCount} file(s) uploaded, ${errorCount} file(s) failed.`);
    } else if (errorCount > 0) {
      toast.error(`All ${errorCount} file(s) failed to upload.`);
    }
    window.location.reload(); // Refresh the page after all uploads are processed
  }, []);

  const {
    handleFileSelect,
    ConfirmationDialog: FileUploadConfirmationDialog,
    isUploading,
  } = useFileUpload(handleUploadSuccess, handleUploadError, handleAllUploadsComplete);

  return (
    <div className="flex min-h-screen bg-white dark:bg-zinc-950">
      <Sidebar onFileSelect={handleFileSelect} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <FileUploadConfirmationDialog />
      <Toaster richColors position="bottom-right" />{" "}
      {/* Render the Sonner Toaster */}
      {isUploading && <Loader />}
    </div>
  );
};

export default Layout;
