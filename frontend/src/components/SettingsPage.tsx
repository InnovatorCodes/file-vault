import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { formatBytes } from "../utils/formatBytes";

const SettingsPage = () => {
  const [quota, setQuota] = useState({
    rate_limit: 0,
    storage_quota: 0,
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    const fetchQuota = async () => {
      const userId = localStorage.getItem("user_id");
      if (!userId) {
        toast.error("User ID not found in localStorage.");
        return;
      }

      try {
        const response = await fetch(`/api/v1/user/quota?user_id=${userId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setQuota(data);
      } catch (error) {
        console.error("Failed to fetch quota:", error);
        toast.error("Failed to fetch user quota.");
      }
    };

    fetchQuota();
  }, []);

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error("All password fields are required.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("New password and confirm new password do not match.");
      return;
    }
    if (newPassword.length < 6) { // Example: minimum password length
      toast.error("New password must be at least 6 characters long.");
      return;
    }

    try {
      const userId = localStorage.getItem("user_id");
      if (!userId) {
        toast.error("User ID not found. Please log in.");
        return;
      }

      const response = await fetch("/api/v1/user/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId, // Use X-User-ID header for authentication
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("Server response was not JSON:", text);
        throw new Error(`Server returned non-JSON response: ${text}`);
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      toast.success(data.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error: any) {
      console.error("Failed to update password:", error);
      toast.error(error.message || "Failed to update password.");
    }
  };

  return (
    <div className="relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-300 min-h-screen font-sans overflow-hidden">
      {/* Animated Aurora Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-gradient-to-tr from-purple-900/50 to-indigo-900/50 rounded-full blur-3xl animate-pulse-slow opacity-30"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-gradient-to-bl from-teal-900/50 to-sky-900/50 rounded-full blur-3xl animate-pulse-slow-delay opacity-30"></div>
      </div>

      <main className="relative z-10 p-4 sm:p-6 md:p-8 flex flex-col">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 w-full"
        >
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Settings
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            View your account details and limits.
          </p>
        </motion.header>

        {/* Password Change Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-4xl self-center mb-8"
        >
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
            Security
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2"
              >
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2"
              >
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="confirmNewPassword"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2"
              >
                Confirm New Password
              </label>
              <input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={handleUpdatePassword}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 transition-colors duration-200"
            >
              Update Password
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-4xl self-center"
        >
          <div className="space-y-6">
            <div>
              <label
                htmlFor="rateLimit"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2"
              >
                Rate Limit (API requests per second)
              </label>
              <input
                id="rateLimit"
                type="text"
                disabled
                value={quota.rate_limit}
                className="w-full bg-gray-100 dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 cursor-not-allowed"
              />
              <p className="text-xs text-zinc-500 mt-2">
                This setting can only be modified by an administrator.
              </p>
            </div>
            <div>
              <label
                htmlFor="storageQuota"
                className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2"
              >
                Storage Quota
              </label>
              <input
                id="storageQuota"
                type="text"
                disabled
                value={formatBytes(quota.storage_quota)}
                className="w-full bg-gray-100 dark:bg-zinc-800/40 border border-gray-300 dark:border-zinc-700/80 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 cursor-not-allowed"
              />
              <p className="text-xs text-zinc-500 mt-2">
                This setting can only be modified by an administrator.
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default SettingsPage;
