import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { isLoggedIn } from '../../utils/api';

const GuestRoute: React.FC = () => {
  const isAuthenticated = isLoggedIn();
  return isAuthenticated ? <Navigate to="/" /> : <Outlet />;
};

export default GuestRoute;
