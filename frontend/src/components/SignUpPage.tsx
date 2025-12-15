import React, { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { User, Mail, Lock } from "lucide-react";
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

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!username || !email || !password || !firstName || !lastName || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    try {
      const response = await fetch("/api/v1/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
          first_name: firstName,
          last_name: lastName,
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
        toast.success("Registration successful! You can now log in.");
        navigate("/login");
      } else {
        toast.error(`Registration failed: ${data.error || 'Unknown server error'}`);
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("An error occurred during registration. Please check the console for details.");
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
        {/* Sign-up Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/30">
          <motion.div variants={itemVariants} className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">Create Account</h1>
            <p className="text-gray-400 mt-2">
              Join us and start managing your files.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex space-x-4">
              {/* First Name Input */}
              <motion.div variants={itemVariants} className="w-1/2">
                <label
                  className="text-sm font-medium text-gray-400"
                  htmlFor="firstName"
                >
                  First Name
                </label>
                <div className="relative mt-2">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={18}
                  />
                  <input
                    id="firstName"
                    type="text"
                    placeholder="Test"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                  />
                </div>
              </motion.div>

              {/* Last Name Input */}
              <motion.div variants={itemVariants} className="w-1/2">
                <label
                  className="text-sm font-medium text-gray-400"
                  htmlFor="lastName"
                >
                  Last Name
                </label>
                <div className="relative mt-2">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    size={18}
                  />
                  <input
                    id="lastName"
                    type="text"
                    placeholder="User"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                  />
                </div>
              </motion.div>
            </div>
            {/* Username Input */}
            <motion.div variants={itemVariants}>
              <label
                className="text-sm font-medium text-gray-400"
                htmlFor="username"
              >
                Username
              </label>
              <div className="relative mt-2">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="username"
                  type="text"
                  placeholder="alex_johnson"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                />
              </div>
            </motion.div>

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

            {/* Confirm Password Input */}
            <motion.div variants={itemVariants}>
              <label
                className="text-sm font-medium text-gray-400"
                htmlFor="confirmPassword"
              >
                Confirm Password
              </label>
              <div className="relative mt-2">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                />
              </div>
            </motion.div>

            {/* Create Account Button */}
            <motion.div variants={itemVariants}>
              <button
                type="submit"
                className="w-full bg-gray-200 hover:bg-gray-300 text-black font-bold py-3 px-4 rounded-lg shadow-lg shadow-gray-500/20 transition-colors duration-300"
              >
                Create Account
              </button>
            </motion.div>
          </form>

          {/* Login Link */}
          <motion.div variants={itemVariants} className="text-center mt-8">
            <p className="text-sm text-gray-400">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-gray-300 hover:text-white"
              >
                Log In
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default SignUpPage;
