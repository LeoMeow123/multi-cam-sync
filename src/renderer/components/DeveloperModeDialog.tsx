/**
 * Developer Mode Dialog Component
 *
 * Password-protected dialog to enable developer mode for testing
 * the UI without actual hardware connections.
 */

import React, { useState } from 'react';

interface DeveloperModeDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const DEV_MODE_PASSWORD = '188393';

const DeveloperModeDialog: React.FC<DeveloperModeDialogProps> = ({
  onConfirm,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === DEV_MODE_PASSWORD) {
      onConfirm();
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-80 shadow-xl border border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Enter Developer Password</h2>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            autoFocus
            className={`w-full px-3 py-2 rounded-lg bg-gray-700 border ${
              error ? 'border-red-500' : 'border-gray-600'
            } focus:outline-none focus:border-blue-500 text-white placeholder-gray-400`}
          />

          {error && (
            <p className="text-red-400 text-sm mt-2">Incorrect password</p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeveloperModeDialog;
