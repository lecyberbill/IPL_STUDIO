import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { defaultOutputDir } from '../engine/paths';
import { FolderPlus, X, HardDrive, Trash2, Check, Edit2, Play, Folder, Database, Webhook, ShieldCheck, Bot, Cpu, FileCode } from 'lucide-react';

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  code: (name: string) => string;
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'crud',
    name: 'Data CRUD',
    description: 'Entities, stores, typed fields & filters',
    icon: <Database size={16} className="text-cyan-400" />,
    accent: 'cyan',
    code: (name) => `// Project IPL Spec: ${name}\nadd entity item {\n  name: "SampleItem",\n  price: 99.99\n}\nread item from itemStore {\n  where: id == targetId\n}`,
  },
  {
    id: 'api',
    name: 'REST / Event API',
    description: 'Listeners, handlers & response payloads',
    icon: <Webhook size={16} className="text-purple-400" />,
    accent: 'purple',
    code: (name) => `// API Spec: ${name}\nlisten event on "api_request" {\n  action: "processData"\n}\ncompute response {\n  status: 200,\n  message: "Success"\n}`,
  },
  {
    id: 'auth',
    name: 'Auth & Security',
    description: 'Users, permissions & access control',
    icon: <ShieldCheck size={16} className="text-emerald-400" />,
    accent: 'emerald',
    code: (name) => `// Auth Spec: ${name}\nadd user {\n  email: "user@domain.com",\n  passwordHash: "secret"\n}\nif user.isAuthorized {\n  return token\n}`,
  },
  {
    id: 'chatbot',
    name: 'Chat Bot',
    description: 'Conversation flows & intent routing',
    icon: <Bot size={16} className="text-indigo-400" />,
    accent: 'indigo',
    code: (name) => `// Chat Bot Spec: ${name}\nlisten event on "message:received" {\n  read content from event {\n    where: content != ""\n  }\n  if (content.startsWith("/help")) {\n    send helpMenu to content.from\n  } else {\n    send reply to content.from {\n      message: "Echo: " + content.text\n    }\n  }\n}`,
  },
  {
    id: 'iot',
    name: 'IoT / Telemetry',
    description: 'Device ingest, thresholds & alerts',
    icon: <Cpu size={16} className="text-rose-400" />,
    accent: 'rose',
    code: (name) => `// IoT Spec: ${name}\nadd device {\n  id: "sensor-01",\n  temperature: 23.5\n}\nlisten event on "telemetry:ingested" {\n  read reading from event {\n    where: reading.temperature != null\n  }\n  if (reading.temperature > 80) {\n    send alert to ops {\n      message: "Overheating: " + reading.id\n    }\n  }\n}`,
  },
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from an empty editor',
    icon: <FileCode size={16} className="text-gray-400" />,
    accent: 'gray',
    code: (name) => `// New IPL Project: ${name}\nadd item {\n  name: "${name}"\n}\n`,
  },
];

export const ProjectModal: React.FC = () => {
  const { 
    isProjectModalOpen, 
    toggleProjectModal, 
    createProject, 
    deleteProject,
    renameProject,
    switchProject,
    projects,
    activeProjectId,
    addLog 
  } = useIdeStore();

  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
  const [projectName, setProjectName] = useState('');
  const [customOutputDir, setCustomOutputDir] = useState('');
  const [templateId, setTemplateId] = useState<string>('crud');

  // Inline editing state for rename in management tab
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  if (!isProjectModalOpen) return null;

  const safeName = projectName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') || 'my_project';
  const suggestedOutputDir = defaultOutputDir(safeName);
  const selectedTemplate = PROJECT_TEMPLATES.find(t => t.id === templateId) || PROJECT_TEMPLATES[0];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    const templateCode = selectedTemplate.code(projectName.trim());

    const finalOutputDir = customOutputDir.trim() || suggestedOutputDir;
    createProject(projectName.trim(), templateCode, finalOutputDir);
    addLog(`New project "${projectName.trim()}" created from template "${selectedTemplate.name}". Disk path: ${finalOutputDir}`, 'success');
    setProjectName('');
    setCustomOutputDir('');
    setTemplateId('crud');
    toggleProjectModal();
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      renameProject(id, editingName.trim());
      addLog(`Project renamed to "${editingName.trim()}".`, 'info');
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (projects.length <= 1) {
      addLog('Cannot delete the last remaining project.', 'warn');
      return;
    }
    if (window.confirm(`Are you sure you want to delete project "${name}"?`)) {
      deleteProject(id);
      addLog(`Project "${name}" deleted.`, 'info');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2f42] flex items-center justify-between bg-[#0f1117] shrink-0">
          <div className="flex items-center space-x-2">
            <FolderPlus size={18} className="text-cyan-400" />
            <h2 className="font-bold text-white text-sm">Project Manager</h2>
          </div>
          <button
            onClick={toggleProjectModal}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#2a2f42] bg-[#12141c] shrink-0">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2.5 px-4 text-xs font-semibold flex items-center justify-center space-x-2 transition-all border-b-2 ${
              activeTab === 'create'
                ? 'border-cyan-500 text-cyan-300 bg-[#161922]'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#161922]/50'
            }`}
          >
            <FolderPlus size={14} />
            <span>Create New Project</span>
          </button>

          <button
            onClick={() => setActiveTab('manage')}
            className={`flex-1 py-2.5 px-4 text-xs font-semibold flex items-center justify-center space-x-2 transition-all border-b-2 ${
              activeTab === 'manage'
                ? 'border-cyan-500 text-cyan-300 bg-[#161922]'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#161922]/50'
            }`}
          >
            <Folder size={14} />
            <span>Manage Projects ({projects.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-gray-300">
          {activeTab === 'create' ? (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
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
                  placeholder={suggestedOutputDir}
                  value={customOutputDir}
                  onChange={(e) => setCustomOutputDir(e.target.value)}
                  className="w-full bg-[#0f1117] border border-[#2a2f42] rounded-lg px-3 py-2 text-cyan-300 font-mono text-[11px] focus:outline-none focus:border-cyan-500 placeholder-gray-600"
                />
                <p className="mt-1 text-[10px] text-gray-500 font-mono truncate">
                  Will write files to: <span className="text-gray-400">{customOutputDir.trim() || suggestedOutputDir}</span>
                </p>
                <p className="mt-1 text-[10px] text-gray-500">
                  Relative paths stay inside the program folder. Use an absolute path (e.g. D:\Projects\my_app) to create the project anywhere on your machine.
                </p>
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1.5 uppercase text-[10px] tracking-wider">
                  Starter Specification Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PROJECT_TEMPLATES.map((t) => {
                    const isSelected = templateId === t.id;
                    const activeClass = {
                      cyan: 'border-cyan-500 bg-cyan-500/10 text-cyan-300',
                      purple: 'border-purple-500 bg-purple-500/10 text-purple-300',
                      emerald: 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
                      indigo: 'border-indigo-500 bg-indigo-500/10 text-indigo-300',
                      rose: 'border-rose-500 bg-rose-500/10 text-rose-300',
                      gray: 'border-gray-500 bg-gray-500/10 text-gray-300'
                    }[t.accent];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplateId(t.id)}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? activeClass
                            : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                        }`}
                        title={t.description}
                      >
                        <div className="flex items-center space-x-1.5 mb-1">
                          {t.icon}
                          <span className="font-bold text-xs">{t.name}</span>
                        </div>
                        <p className="text-[10px] opacity-80 leading-tight">{t.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

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
          ) : (
            <div className="space-y-3">
              {projects.map((proj) => {
                const isActive = proj.id === activeProjectId;
                const safeProjName = proj.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const diskPath = proj.outputDir || defaultOutputDir(safeProjName);

                return (
                  <div
                    key={proj.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-cyan-500/10 border-cyan-500/60 shadow-md'
                        : 'bg-[#0f1117] border-[#2a2f42] hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 flex-1 mr-2">
                        {editingId === proj.id ? (
                          <div className="flex items-center space-x-1 flex-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="bg-[#161922] border border-cyan-500 rounded px-2 py-1 text-white text-xs font-semibold focus:outline-none flex-1"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveRename(proj.id)}
                              className="p-1 bg-emerald-500 text-black rounded hover:bg-emerald-400"
                              title="Save Name"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-white text-sm">{proj.name}</span>
                            {isActive && (
                              <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-2 py-0.5 rounded border border-cyan-500/40 font-mono">
                                ACTIVE
                              </span>
                            )}
                            <button
                              onClick={() => handleStartRename(proj.id, proj.name)}
                              className="text-gray-500 hover:text-gray-300 p-0.5"
                              title="Rename Project"
                            >
                              <Edit2 size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {!isActive && (
                          <button
                            onClick={() => {
                              switchProject(proj.id);
                              toggleProjectModal();
                            }}
                            className="px-2.5 py-1 bg-[#161922] hover:bg-[#2a2f42] text-cyan-300 rounded border border-[#2a2f42] text-xs font-medium flex items-center space-x-1"
                            title="Switch to this project"
                          >
                            <Play size={12} />
                            <span>Activate</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(proj.id, proj.name)}
                          disabled={projects.length <= 1}
                          className="p-1.5 bg-[#161922] hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded border border-[#2a2f42] hover:border-red-500/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete Project"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px] text-gray-400 font-mono">
                      <div className="flex items-center space-x-1.5 text-gray-400 truncate">
                        <HardDrive size={12} className="text-cyan-400 shrink-0" />
                        <span className="truncate">{diskPath}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] opacity-70">
                        <span>Target: <strong className="text-gray-300 uppercase">{proj.targetLang}</strong></span>
                        <span>Updated: {proj.updatedAt}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
