import { useState } from "react";

const useFileUpload = (
  onUploadSuccess?: (fileName: string) => void, // Modified to pass file name
  onUploadError?: (message: string) => void,
  onAllUploadsComplete?: (successCount: number, errorCount: number) => void // New callback
) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (files: File[] | FileList | null) => {
    if (!files || (Array.isArray(files) && files.length === 0) || (!Array.isArray(files) && files.length === 0)) return;

    let filesArray: File[];
    if (Array.isArray(files)) {
      filesArray = files;
    } else {
      filesArray = Array.from(files);
    }
    setSelectedFiles(filesArray);
    setIsConfirming(true);
  };

  const handleCancelUpload = () => {
    setIsConfirming(false);
    setSelectedFiles([]);
  };

  const handleConfirmUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true); // Start loading for all files

    const ownerId = localStorage.getItem("user_id");
    if (!ownerId) {
      alert("You must be logged in to upload files.");
      setIsUploading(false);
      handleCancelUpload();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`/api/v1/upload?owner_id=${ownerId}`, {
          method: "POST",
          body: formData,
        });

        const responseText = await response.text();

        if (!response.ok) {
          let errorData;
          try {
            errorData = JSON.parse(responseText);
          } catch (parseError) {
            console.error("Failed to parse error response as JSON:", parseError);
            onUploadError?.(`Server error for ${file.name}: ${responseText || "Unknown error"}`);
            errorCount++;
            continue;
          }
          onUploadError?.(errorData.error || `File upload failed for ${file.name}`);
          errorCount++;
          continue;
        }

        try {
          JSON.parse(responseText);
        } catch (parseError) {
          console.error("Failed to parse successful response as JSON:", parseError);
          onUploadError?.(`File ${file.name} uploaded, but response was malformed.`);
          errorCount++;
          continue;
        }

        onUploadSuccess?.(file.name); // Call success callback for each file, passing file name
        successCount++;
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error);
        let errorMessage = `An unknown error occurred during upload of ${file.name}.`;
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        onUploadError?.(errorMessage);
        errorCount++;
      }
    }

    setIsUploading(false);
    handleCancelUpload();
    onAllUploadsComplete?.(successCount, errorCount); // Call new callback after all uploads
  };

  const ConfirmationDialog = () => (
    <>
      {isConfirming && selectedFiles.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-zinc-800 rounded-lg p-6 shadow-xl w-full max-w-md border border-zinc-700">
            <h3 className="text-lg font-bold text-zinc-100 mb-4">Confirm Upload</h3>
            <p className="text-zinc-300 mb-4">
              Are you sure you want to upload the following files:
            </p>
            <ul className="list-disc list-inside text-zinc-200 mb-6 max-h-40 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <li key={index} className="break-all">{file.name}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-4">
              <button
                onClick={handleCancelUpload}
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors font-semibold text-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                className="px-4 py-2 rounded-lg bg-zinc-600 hover:bg-zinc-500 transition-colors font-semibold text-zinc-100"
              >
                Confirm & Upload All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return {
    handleFileSelect,
    ConfirmationDialog,
    isUploading, // Return isUploading state
  };
};

export default useFileUpload;
