import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const GuestRoute: React.FC = () => {
  const isAuthenticated = !!localStorage.getItem('user_id');
  return isAuthenticated ? <Navigate to="/" /> : <Outlet />;
};

export default GuestRoute;
