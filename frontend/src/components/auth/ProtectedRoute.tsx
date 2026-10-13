import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { isLoggedIn } from '../../utils/api';

const ProtectedRoute: React.FC = () => {
  const isAuthenticated = isLoggedIn();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" />;
};

export default ProtectedRoute;
