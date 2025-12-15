import React, { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Mail, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
// Reusable Framer Motion variants for staggered animation
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 100 },
  },
};

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }
    try {
      const response = await fetch("/api/v1/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        // Handle cases where the response is not valid JSON
        console.error("Failed to parse JSON response:", responseText);
        toast.error(`An error occurred: Server returned a non-JSON response. Status: ${response.status}`);
        return;
      }

      if (response.ok) {
        toast.success("Login successful!");
        // Assuming the backend returns user_id, username and email on successful login
        // console.log(data) // Removed debug log
        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("username", data.username);
        localStorage.setItem("email", data.email);
        localStorage.setItem("first_name", data.first_name);
        localStorage.setItem("last_name", data.last_name)
        localStorage.setItem("is_admin", data.is_admin)
        navigate("/"); // Redirect to home page
      } else {
        toast.error(`Login failed: ${data.error || 'Unknown server error'}`);
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("An error occurred during login. Please check the console for details.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 p-4">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        {/* Login Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/30">
          <motion.div variants={itemVariants} className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">Welcome Back!</h1>
            <p className="text-gray-400 mt-2">
              Log in to manage your files.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <motion.div variants={itemVariants}>
              <label
                className="text-sm font-medium text-gray-400"
                htmlFor="email"
              >
                Email Address
              </label>
              <div className="relative mt-2">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="email"
                  type="email"
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                />
              </div>
            </motion.div>

            {/* Password Input */}
            <motion.div variants={itemVariants}>
              <label
                className="text-sm font-medium text-gray-400"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative mt-2">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                />
              </div>
            </motion.div>

            {/* Login Button */}
            <motion.div variants={itemVariants}>
              <button
                type="submit"
                className="w-full bg-gray-200 hover:bg-gray-300 text-black font-bold py-3 px-4 rounded-lg shadow-lg shadow-gray-500/20 transition-colors duration-300"
              >
                Log In
              </button>
            </motion.div>
          </form>

          {/* Sign-up Link */}
          <motion.div variants={itemVariants} className="text-center mt-8">
            <p className="text-sm text-gray-400">
              Don't have an account?{" "}
              <Link
                to="/signup"
                className="font-medium text-gray-300 hover:text-white"
              >
                Sign Up
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
