import React, {
  useState,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- TYPES ---
interface DialogOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmationDialogContextType {
  openConfirmation: (options: DialogOptions) => void;
}

// --- CONTEXT ---
const ConfirmationDialogContext =
  createContext<ConfirmationDialogContextType | null>(null);

// --- HOOK ---
export const useConfirmationDialog = () => {
  const context = useContext(ConfirmationDialogContext);
  if (!context) {
    throw new Error(
      "useConfirmationDialog must be used within a ConfirmationDialogProvider"
    );
  }
  return context;
};

// --- DIALOG COMPONENT ---
const ConfirmationDialogComponent: React.FC<
  DialogOptions & { onCancel: () => void }
> = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300"
      onClick={onCancel} // Close on backdrop click
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-zinc-800 rounded-lg p-6 shadow-xl w-full max-w-md border border-zinc-700"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <h3 className="text-lg font-bold text-zinc-100 mb-4">{title}</h3>
        <p className="text-zinc-300 mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors font-semibold text-zinc-100"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors font-semibold text-zinc-100"
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// --- PROVIDER ---
export const ConfirmationDialogProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [dialogState, setDialogState] = useState<DialogOptions | null>(null);

  const openConfirmation = useCallback((options: DialogOptions) => {
    setDialogState(options);
  }, []);

  const handleClose = useCallback(() => {
    setDialogState(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialogState?.onConfirm) {
      dialogState.onConfirm();
    }
    handleClose();
  }, [dialogState, handleClose]);

  return (
    <ConfirmationDialogContext.Provider value={{ openConfirmation }}>
      {children}
      <AnimatePresence>
        {dialogState && (
          <ConfirmationDialogComponent
            {...dialogState}
            onConfirm={handleConfirm}
            onCancel={handleClose}
          />
        )}
      </AnimatePresence>
    </ConfirmationDialogContext.Provider>
  );
};

export default useConfirmationDialog;
