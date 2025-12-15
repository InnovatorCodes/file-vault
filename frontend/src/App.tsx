import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import SignUpPage from "./components/SignUpPage";
import LoginPage from "./components/LoginPage";
import HomePage from "./components/HomePage";
import AllFiles from "./components/AllFiles";
import PubliclySharedFiles from "./components/PubliclySharedFiles"; // Import the new component
import PublicShareView from "./components/PublicShareView"; // Import the new PublicShareView component
import SettingsPage from "./components/SettingsPage";
import { ConfirmationDialogProvider } from "./hooks/useConfirmationDialog";
import GuestRoute from "./components/auth/GuestRoute";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { Toaster } from "sonner";

const AppContent: React.FC = () => {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="files" element={<AllFiles />} />
          <Route path="shared-publicly" element={<PubliclySharedFiles />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route element={<GuestRoute />}>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/share/:token" element={<PublicShareView />} /> {/* New route for public share view */}
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <Toaster position="top-right" richColors closeButton />
      <ConfirmationDialogProvider>
        <AppContent />
      </ConfirmationDialogProvider>
    </Router>
  );
};

export default App;
