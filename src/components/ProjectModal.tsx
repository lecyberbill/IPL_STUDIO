import React, { useState, useRef } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { downloadProjectZip } from '../engine/artifactGenerator';
import { 
  FolderPlus, 
  Trash2, 
  Download, 
  Upload, 
  X, 
  Folder, 
  Edit2, 
  Check, 
  FileCode,
  Calendar,
  Package,
  HardDrive,
  Save
} from 'lucide-react';

export const ProjectModal: React.FC = () => {
  const { 
    isProjectModalOpen, 
    toggleProjectModal, 
    projects, 
    activeProjectId, 
    switchProject, 
    createProject, 
    deleteProject, 
    renameProject,
    setProjectOutputDir,
    exportProject,
    importProject,
    writeArtifactToDisk,
    compiledCode
  } = useIdeStore();

  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDirId, setEditingDirId] = useState<string | null>(null);
  const [editingDir, setEditingDir] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isProjectModalOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const defaultDir = `d:/image_to_text/IPL/output/${newProjectName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    createProject(newProjectName.trim(), undefined, defaultDir);
    setNewProjectName('');
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveRename = (id: string) => {
    renameProject(id, editingName);
    setEditingId(null);
  };

  const handleStartEditDir = (id: string, currentDir?: string, projName?: string) => {
    setEditingDirId(id);
    setEditingDir(currentDir || `d:/image_to_text/IPL/output/${projName?.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
  };

  const handleSaveDir = (id: string) => {
    setProjectOutputDir(id, editingDir);
    setEditingDirId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        importProject(file.name, content);
      };
      reader.readAsText(file);
    }
  };

  const handleExportZip = async (projId: string, projName: string, targetLang: any, code: string) => {
    setExportingId(projId);
    try {
      await downloadProjectZip(
        projName,
        targetLang,
        compiledCode || `// Code généré par IPL Studio pour ${projName}`,
        code
      );
    } catch (err) {
      console.error(err);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#2a2f42] flex items-center justify-between bg-[#0f1117]">
          <div className="flex items-center space-x-2.5">
            <Folder size={18} className="text-cyan-400" />
            <h2 className="font-bold text-white text-sm">Gestionnaire de Projets & Dossiers Physiques d'Output</h2>
          </div>
          <button
            onClick={toggleProjectModal}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Create / Import Bar */}
        <div className="p-4 border-b border-[#2a2f42] bg-[#12141c] flex items-center justify-between gap-3">
          <form onSubmit={handleCreate} className="flex-1 flex items-center space-x-2">
            <input
              type="text"
              placeholder="Nom du nouveau projet..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="flex-1 bg-[#0f1117] border border-[#2a2f42] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={!newProjectName.trim()}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-bold rounded-lg text-xs transition-colors"
            >
              <FolderPlus size={15} />
              <span>Créer</span>
            </button>
          </form>

          <div className="h-6 w-[1px] bg-[#2a2f42]" />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#161922] hover:bg-[#2a2f42] text-gray-300 rounded-lg border border-[#2a2f42] text-xs transition-colors"
          >
            <Upload size={14} className="text-cyan-400" />
            <span>Importer .ipl</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".ipl,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            const isEditing = editingId === proj.id;
            const isEditingDir = editingDirId === proj.id;
            const isZipping = exportingId === proj.id;
            const outputDir = proj.outputDir || `d:/image_to_text/IPL/output/${proj.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

            return (
              <div
                key={proj.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${
                  isActive
                    ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md'
                    : 'bg-[#0f1117] border-[#2a2f42] hover:border-gray-600'
                }`}
              >
                {/* Upper Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0 pr-4">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-cyan-500 text-black' : 'bg-[#161922] text-gray-400'}`}>
                      <FileCode size={18} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="bg-[#161922] border border-cyan-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRename(proj.id)}
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-white text-xs truncate">{proj.name}</h3>
                          {isActive && (
                            <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/30">
                              Actif
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center space-x-3 text-[10px] text-gray-500 mt-1 font-mono">
                        <span className="uppercase text-cyan-400">{proj.targetLang}</span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <Calendar size={10} />
                          <span>Modifié à {proj.updatedAt}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    {!isActive && (
                      <button
                        onClick={() => switchProject(proj.id)}
                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-medium transition-colors"
                      >
                        Ouvrir
                      </button>
                    )}

                    {isActive && compiledCode && (
                      <button
                        onClick={() => writeArtifactToDisk(proj.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-medium transition-colors"
                        title="Matérialiser les fichiers directement dans le dossier physique sur disque"
                      >
                        <Save size={13} />
                        <span>Matérialiser</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleExportZip(proj.id, proj.name, proj.targetLang, proj.code)}
                      disabled={isZipping}
                      className="flex items-center space-x-1 px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-medium transition-colors"
                      title="Exporter l'artefact projet complet (.zip avec arborescence)"
                    >
                      <Package size={13} />
                      <span>{isZipping ? 'Zip...' : 'Zip'}</span>
                    </button>

                    <button
                      onClick={() => handleStartRename(proj.id, proj.name)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-[#161922] rounded transition-colors"
                      title="Renommer le projet"
                    >
                      <Edit2 size={14} />
                    </button>

                    <button
                      onClick={() => exportProject(proj.id)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-[#161922] rounded transition-colors"
                      title="Exporter le fichier (.ipl)"
                    >
                      <Download size={14} />
                    </button>

                    {projects.length > 1 && (
                      <button
                        onClick={() => deleteProject(proj.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                        title="Supprimer le projet"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lower Row : Physical Output Directory Bar */}
                <div className="pt-2 border-t border-[#2a2f42]/60 flex items-center justify-between text-[11px] font-mono text-gray-400">
                  <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-2">
                    <HardDrive size={13} className="text-amber-400 shrink-0" />
                    <span className="text-gray-500 shrink-0">Dossier Physique :</span>
                    {isEditingDir ? (
                      <div className="flex items-center space-x-1 flex-1">
                        <input
                          type="text"
                          value={editingDir}
                          onChange={(e) => setEditingDir(e.target.value)}
                          className="flex-1 bg-[#161922] border border-amber-500 rounded px-2 py-0.5 text-[11px] text-amber-300 focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveDir(proj.id)}
                          className="p-1 text-emerald-400 hover:text-emerald-300"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-amber-300/90 truncate font-semibold">{outputDir}</span>
                    )}
                  </div>

                  {!isEditingDir && (
                    <button
                      onClick={() => handleStartEditDir(proj.id, proj.outputDir, proj.name)}
                      className="text-[10px] text-gray-400 hover:text-amber-300 hover:underline shrink-0"
                    >
                      Modifier le dossier
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#2a2f42] bg-[#0f1117] flex justify-between items-center text-xs text-gray-500">
          <span>{projects.length} projet(s) enregistré(s) avec dossier d'output disque</span>
          <button
            onClick={toggleProjectModal}
            className="px-4 py-1.5 rounded-lg bg-[#2a2f42] hover:bg-gray-700 text-white font-medium text-xs transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
