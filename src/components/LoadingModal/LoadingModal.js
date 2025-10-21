import React from 'react';
import './LoadingModal.css';

export default function LoadingModal({ status = 'Loading...', progress = 0 }) {
  return (
    <div className="loading-modal">
      <div className="loading-content">
        <div className="loading-status">{status}</div>
        <div className="loading-progress">{Math.round(progress)}%</div>
      </div>
    </div>
  );
}
