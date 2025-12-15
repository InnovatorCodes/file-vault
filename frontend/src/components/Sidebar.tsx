import React, { useRef, useState, useEffect } from "react";
import { motion, type Variants, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import useClickOutside from "../hooks/useClickOutside";
import {
  Home,
  Folder,
  Settings,
  HardDrive,
  Plus,
  ChevronDown,
  Share2,
} from "lucide-react";
import { formatBytes } from "../utils/formatBytes"; // Import formatBytes
import ProfilePopover from "./ProfilePopover"; // Import the new component

// --- VARIANTS ---
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } },
};

interface SidebarProps {
  onFileSelect: (files: FileList | null) => void;
}

// --- SIDEBAR COMPONENT ---
const Sidebar: React.FC<SidebarProps> = ({ onFileSelect }) => {
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [username, setUsername] = useState("Guest");
  const [email, setEmail] = useState("guest@example.com");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isProfilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [storageStats, setStorageStats] = useState({
    total_storage_used_deduplicated: 0,
    storage_savings_percentage: "0.00%",
    storage_quota: 1, // Default to 1 to avoid division by zero
  });
  const [isStorageExpanded, setStorageExpanded] = useState(false);

  useClickOutside(popoverRef as React.RefObject<HTMLElement>, () => setProfilePopoverOpen(false));

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    const storedEmail = localStorage.getItem("email");
    const storedFirstName = localStorage.getItem("first_name");
    const storedLastName = localStorage.getItem("last_name");
    const userId = localStorage.getItem("user_id");

    if (storedUsername) setUsername(storedUsername);
    if (storedEmail) setEmail(storedEmail);
    if (storedFirstName) setFirstName(storedFirstName);
    if (storedLastName) setLastName(storedLastName);

    const fetchStorageStats = async () => {
      if (!userId) {
        console.error("User ID not found in localStorage.");
        return;
      }
      try {
        const response = await fetch(`/api/v1/stats?user_id=${userId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setStorageStats(data);
      } catch (error) {
        console.error("Failed to fetch storage stats:", error);
      }
    };

    fetchStorageStats();
  }, [location]);

  const avatarLetter = username.charAt(0).toUpperCase();

  const navItems = [
    { path: "/", label: "Home", icon: <Home size={20} /> },
    { path: "/files", label: "All Files", icon: <Folder size={20} /> },
    { path: "/shared-publicly", label: "Shared Publicly", icon: <Share2 size={20} /> },
    { path: "/settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  const handleNewFileClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFileSelect(e.target.files);
    }
    e.target.value = ""; // Clear the input after selection
  };

  return (
    <aside className="w-64 bg-gray-50 dark:bg-zinc-900/70 backdrop-blur-xl border-r border-gray-200 dark:border-white/5 text-zinc-700 dark:text-zinc-400 flex flex-col p-4 h-screen sticky top-0">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col h-full">
        <motion.div variants={itemVariants} className="mb-8 py-2 flex justify-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center">
              <span className="text-white dark:text-black font-bold text-xl">F</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tighter">Flux File Vault</h1>
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} onClick={handleNewFileClick} className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 font-bold py-2.5 px-3 rounded-lg mb-6 transition-all duration-300 shadow-lg shadow-black/20">
            <Plus size={20} /> New Upload
          </motion.button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
        </motion.div>

        <motion.nav variants={itemVariants} className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path} className="relative list-none">
              <Link to={item.path} className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg relative z-10 transition-colors duration-200 ${location.pathname === item.path ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"}`}>
                {item.icon} {item.label}
              </Link>
              {location.pathname === item.path && (
                <motion.div layoutId="activeTab" className="absolute inset-0 rounded-lg bg-gray-200 dark:bg-white/5" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
              )}
            </li>
          ))}
        </motion.nav>

        <div className="flex-grow" />

        <motion.div variants={itemVariants} className="px-2">
          <button
            onClick={() => setStorageExpanded(!isStorageExpanded)}
            className="w-full flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-400 mb-2"
          >
            <div className="flex items-center gap-2">
              <HardDrive size={16} />
              <span>Storage</span>
            </div>
            <motion.div
              animate={{ rotate: isStorageExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronDown size={16} />
            </motion.div>
          </button>
          <div className="h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-zinc-900 dark:bg-white"
              style={{
                width: `${(storageStats.total_storage_used_deduplicated /
                  (storageStats.storage_quota || 1)) * // Fallback to 1 to prevent division by zero
                  100
                  }%`,
              }}
            ></div>
          </div>
          <AnimatePresence>
            {isStorageExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <p className="text-xs text-zinc-500">
                  {formatBytes(storageStats.total_storage_used_deduplicated)} of{" "}
                  {formatBytes(storageStats.storage_quota)} used
                </p>
                <p className="text-xs text-zinc-500">
                  Savings: {storageStats.storage_savings_percentage}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div ref={popoverRef}>
          <AnimatePresence>
            {isProfilePopoverOpen && (
              <ProfilePopover
                firstName={firstName}
                lastName={lastName}
                email={email}
                onClose={() => setProfilePopoverOpen(false)}
              />
            )}
          </AnimatePresence>

          <motion.div
            variants={itemVariants}
            className="mt-6 pt-6 border-t border-gray-200 dark:border-white/5 flex items-center gap-3 cursor-pointer"
            onClick={() => setProfilePopoverOpen(!isProfilePopoverOpen)}
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-300 text-lg font-bold">
                {avatarLetter}
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-50 dark:border-zinc-900"></div>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{username}</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-400">{email}</p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </aside>
  );
};

export default Sidebar;
