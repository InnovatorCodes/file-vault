import React, { useState, useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import { Lock } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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

const EmailVerificationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email; // Get email from location state
  const fromSignup = location.state?.fromSignup; // Get fromSignup flag from location state
  const [otp, setOtp] = useState("");

  useEffect(() => {
    // If email or fromSignup flag is missing, redirect to signup page
    if (!email || !fromSignup) {
      navigate("/signup", { replace: true });
    }
  }, [email, fromSignup, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!email || !otp) {
      alert("Email or OTP is missing.");
      return;
    }
    try {
      const response = await fetch("/api/v1/verify-otp", { // Assuming a new API endpoint for email verification
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          otp,
        }),
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error("Failed to parse JSON response:", responseText);
        alert(`An error occurred: Server returned a non-JSON response. Status: ${response.status}`);
        return;
      }

      if (response.ok) {
        alert("Email verified successfully! You can now log in.");
        navigate("/login"); // Redirect to login page after successful verification
      } else {
        alert(`Verification failed: ${data.error || 'Unknown server error'}`);
      }
    } catch (error) {
      console.error("Email verification error:", error);
      alert("An error occurred during email verification. Please check the console for details.");
    }
  };

  const handleResendOtp = async () => {
    if (!email) {
      alert("Email is missing. Cannot resend OTP.");
      return;
    }
    try {
      const response = await fetch("/api/v1/resend-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error("Failed to parse JSON response for resend OTP:", responseText);
        alert(`An error occurred: Server returned a non-JSON response. Status: ${response.status}`);
        return;
      }

      if (response.ok) {
        alert("A new OTP has been sent to your email.");
      } else {
        alert(`Failed to resend OTP: ${data.error || 'Unknown server error'}`);
      }
    } catch (error) {
      console.error("Resend OTP error:", error);
      alert("An error occurred during resending OTP. Please check the console for details.");
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
        {/* Email Verification Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/30">
          <motion.div variants={itemVariants} className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">Verify Your Email</h1>
            <p className="text-gray-400 mt-2">
              An OTP has been sent to <span className="font-medium text-gray-300">{email}</span>. Please enter it below.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* OTP Input */}
            <motion.div variants={itemVariants}>
              <label
                className="text-sm font-medium text-gray-400"
                htmlFor="otp"
              >
                One-Time Password (OTP)
              </label>
              <div className="relative mt-2">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  size={18}
                />
                <input
                  id="otp"
                  type="text"
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-gray-400 focus:outline-none transition"
                />
              </div>
            </motion.div>

            {/* Verify Button */}
            <motion.div variants={itemVariants}>
              <button
                type="submit"
                className="w-full bg-gray-200 hover:bg-gray-300 text-black font-bold py-3 px-4 rounded-lg shadow-lg shadow-gray-500/20 transition-colors duration-300"
              >
                Verify Email
              </button>
            </motion.div>
          </form>

          {/* Resend OTP / Back to Login Link */}
          <motion.div variants={itemVariants} className="text-center mt-8">
            <p className="text-sm text-gray-400">
              Didn't receive the OTP?{" "}
              <button
                type="button"
                onClick={handleResendOtp}
                className="font-medium text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                Resend OTP
              </button>
            </p>
            <p className="text-sm text-gray-400 mt-2">
              <Link
                to="/login"
                className="font-medium text-gray-300 hover:text-white"
              >
                Back to Login
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default EmailVerificationPage;
