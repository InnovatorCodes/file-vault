import React from "react";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProfilePopoverProps {
  firstName: string;
  lastName: string;
  email: string;
  onClose: () => void;
}

const ProfilePopover: React.FC<ProfilePopoverProps> = ({
  firstName,
  lastName,
  email,
  onClose,
}) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    localStorage.removeItem("first_name");
    localStorage.removeItem("last_name");
    navigate("/login");
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute bottom-20 left-4 w-60 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg shadow-xl p-4 z-50"
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">First Name</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{firstName}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Last Name</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{lastName}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Email</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{email}</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-md text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </motion.div>
  );
};

export default ProfilePopover;
