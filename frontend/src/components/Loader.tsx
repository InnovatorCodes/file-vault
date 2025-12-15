import React from 'react';
import '../index.css'; // Import the CSS file for the loader styles

const Loader: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50">
      <div className="loader"></div>
      <p className="text-white mt-4 text-lg">Uploading file...</p>
    </div>
  );
};

export default Loader;
