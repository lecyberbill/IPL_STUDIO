import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { FolderPlus, X, HardDrive } from 'lucide-react';

export const ProjectModal: React.FC = () => {
  const { isProjectModalOpen, toggleProjectModal, createProject, addLog } = useIdeStore();

  const [projectName, setProjectName] = useState('');
  const [customOutputDir, setCustomOutputDir] = useState('');
  const [templateType, setTemplateType] = useState<'crud' | 'api' | 'auth'>('crud');

  if (!isProjectModalOpen) return null;

  const safeName = projectName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') || 'my_project';
  const defaultOutputDir = `d:/image_to_text/IPL/output/${safeName}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    let templateCode = '';
    if (templateType === 'crud') {
      templateCode = `// Project IPL Spec: ${projectName}\nadd item {\n  name: "SampleItem",\n  price: 99.99\n}\nread item from itemStore {\n  where: id == targetId\n}`;
    } else if (templateType === 'api') {
      templateCode = `// API Spec: ${projectName}\nlisten event on "api_request" {\n  action: "processData"\n}\ncompute response {\n  status: 200,\n  message: "Success"\n}`;
    } else {
      templateCode = `// Auth Spec: ${projectName}\nadd user {\n  email: "user@domain.com",\n  passwordHash: "secret"\n}\nif user.isAuthorized {\n  return token\n}`;
    }

    const finalOutputDir = customOutputDir.trim() || defaultOutputDir;
    createProject(projectName.trim(), templateCode, finalOutputDir);
    addLog(`New project "${projectName.trim()}" created. Disk path: ${finalOutputDir}`, 'success');
    setProjectName('');
    setCustomOutputDir('');
    toggleProjectModal();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2f42] flex items-center justify-between bg-[#0f1117]">
          <div className="flex items-center space-x-2">
            <FolderPlus size={18} className="text-cyan-400" />
            <h2 className="font-bold text-white text-sm">Create New IPL Project</h2>
          </div>
          <button
            onClick={toggleProjectModal}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs text-gray-300">
          <div>
            <label className="block text-gray-400 font-semibold mb-1.5 uppercase text-[10px] tracking-wider">
              Project Name
            </label>
            <input
              type="text"
              placeholder="e.g. weather_forecast_app"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#2a2f42] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-gray-400 font-semibold mb-1.5 uppercase text-[10px] tracking-wider flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <HardDrive size={12} className="text-cyan-400" />
                <span>Target Disk Destination Directory</span>
              </span>
              <span className="text-[9px] text-gray-500 font-normal">Optional Custom Path</span>
            </label>
            <input
              type="text"
              placeholder={defaultOutputDir}
              value={customOutputDir}
              onChange={(e) => setCustomOutputDir(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#2a2f42] rounded-lg px-3 py-2 text-cyan-300 font-mono text-[11px] focus:outline-none focus:border-cyan-500 placeholder-gray-600"
            />
            <p className="mt-1 text-[10px] text-gray-500 font-mono truncate">
              Will write files to: <span className="text-gray-400">{customOutputDir.trim() || defaultOutputDir}</span>
            </p>
          </div>

          <div>
            <label className="block text-gray-400 font-semibold mb-1.5 uppercase text-[10px] tracking-wider">
              Starter Specification Template
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTemplateType('crud')}
                className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                  templateType === 'crud'
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                Data CRUD
              </button>

              <button
                type="button"
                onClick={() => setTemplateType('api')}
                className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                  templateType === 'api'
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                REST / Event API
              </button>

              <button
                type="button"
                onClick={() => setTemplateType('auth')}
                className={`p-2.5 rounded-lg border text-center font-medium transition-all ${
                  templateType === 'auth'
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                Auth & Security
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-[#2a2f42] flex justify-end space-x-2">
            <button
              type="button"
              onClick={toggleProjectModal}
              className="px-4 py-1.5 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!projectName.trim()}
              className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-black font-bold rounded-lg transition-all shadow"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
