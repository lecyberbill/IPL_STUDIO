import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { TargetLanguage } from './llmCompiler';

export interface ProjectArtifactFile {
  relativePath: string;
  content: string;
}

export interface ProjectArtifact {
  projectName: string;
  targetLang: TargetLanguage;
  files: ProjectArtifactFile[];
}

/**
 * Applique un bloc de modification ciblé SEARCH/REPLACE sur un contenu de fichier existant
 */
export function applyPatchToContent(originalContent: string, patchBlock: string): string {
  const searchReplaceRegex = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>>\s*REPLACE/gi;
  let updatedContent = originalContent;
  let match: RegExpExecArray | null;

  while ((match = searchReplaceRegex.exec(patchBlock)) !== null) {
    const searchTarget = match[1];
    const replacement = match[2];

    if (searchTarget) {
      if (updatedContent.includes(searchTarget)) {
        updatedContent = updatedContent.replace(searchTarget, replacement);
      } else if (updatedContent.includes(searchTarget.trim())) {
        updatedContent = updatedContent.replace(searchTarget.trim(), replacement.trim());
      }
    }
  }

  return updatedContent;
}

/**
 * Extrait de façon ultra-robuste les fichiers empaquetés sous forme de balises <file path="...">
 * ou applique les modifications ciblées de lignes par balises <patch path="...">
 */
export function parseMultiFileXml(rawOutput: string, existingFiles: ProjectArtifactFile[] = []): ProjectArtifactFile[] {
  const filesMap = new Map<string, string>();

  // Conserver les fichiers existants si fournis
  for (const ef of existingFiles) {
    filesMap.set(ef.relativePath, ef.content);
  }

  // 1. Extraire et appliquer les modifications ciblées de lignes par balises <patch path="...">
  const patchHeaderRegex = /<patch\s+path=["']([^"']+)["']\s*>/gi;
  let patchMatch: RegExpExecArray | null;
  const patchMatches: Array<{ path: string; startIndex: number; headerLength: number }> = [];

  while ((patchMatch = patchHeaderRegex.exec(rawOutput)) !== null) {
    patchMatches.push({
      path: patchMatch[1].trim(),
      startIndex: patchMatch.index,
      headerLength: patchMatch[0].length
    });
  }

  for (let i = 0; i < patchMatches.length; i++) {
    const current = patchMatches[i];
    const contentStart = current.startIndex + current.headerLength;
    const contentEnd = (i + 1 < patchMatches.length) ? patchMatches[i + 1].startIndex : rawOutput.length;

    let patchBlock = rawOutput.substring(contentStart, contentEnd);
    const closeTagIndex = patchBlock.indexOf('</patch>');
    if (closeTagIndex !== -1) {
      patchBlock = patchBlock.substring(0, closeTagIndex);
    }

    const existingContent = filesMap.get(current.path) || '';
    if (existingContent && patchBlock) {
      const patchedContent = applyPatchToContent(existingContent, patchBlock);
      filesMap.set(current.path, patchedContent);
    }
  }

  // 2. Extraire les fichiers complets sous forme de balises <file path="...">
  const fileHeaderRegex = /<file\s+path=["']([^"']+)["']\s*>/gi;
  let match: RegExpExecArray | null;
  const matches: Array<{ path: string; startIndex: number; headerLength: number }> = [];

  while ((match = fileHeaderRegex.exec(rawOutput)) !== null) {
    matches.push({
      path: match[1].trim(),
      startIndex: match.index,
      headerLength: match[0].length
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const contentStart = current.startIndex + current.headerLength;
    const contentEnd = (i + 1 < matches.length) ? matches[i + 1].startIndex : rawOutput.length;

    let rawContent = rawOutput.substring(contentStart, contentEnd);
    
    // Si une balise fermante </file> est présente, tronquer le contenu exactement à la balise
    const closeTagIndex = rawContent.indexOf('</file>');
    if (closeTagIndex !== -1) {
      rawContent = rawContent.substring(0, closeTagIndex);
    }
    
    // Nettoyer les blocs de code markdown s'ils existent à la fin
    rawContent = rawContent.replace(/```\s*$/i, '');

    const cleanContent = rawContent.trim();
    if (current.path && cleanContent) {
      filesMap.set(current.path, cleanContent);
    }
  }

  // 3. FALLBACK: Si aucune balise <file> n'a été détectée, extraire les blocs de code Markdown (```lang ... ```)
  if (filesMap.size === 0) {
    const codeBlockRegex = /```([a-z0-9_-]*)\s*\n([\s\S]*?)```/gi;
    let blockMatch: RegExpExecArray | null;
    let htmlIndex = 0;
    let cssIndex = 0;
    let jsIndex = 0;

    while ((blockMatch = codeBlockRegex.exec(rawOutput)) !== null) {
      const lang = blockMatch[1].toLowerCase().trim();
      const codeContent = blockMatch[2].trim();
      if (!codeContent) continue;

      // Chercher si le début du bloc contient un nom de fichier (ex: <!-- css/styles.css --> ou /* css/styles.css */ ou // js/app.js)
      const pathCommentMatch = codeContent.match(/^(?:<!--|\/\*|\/\/|#)\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*(?:-->|\*\/)?/i);
      let detectedPath = pathCommentMatch ? pathCommentMatch[1].trim() : '';

      if (!detectedPath) {
        if (lang === 'html') {
          detectedPath = htmlIndex === 0 ? 'index.html' : `page_${htmlIndex + 1}.html`;
          htmlIndex++;
        } else if (lang === 'css') {
          detectedPath = cssIndex === 0 ? 'css/styles.css' : `css/style_${cssIndex + 1}.css`;
          cssIndex++;
        } else if (lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') {
          detectedPath = jsIndex === 0 ? 'js/app.js' : `js/script_${jsIndex + 1}.js`;
          jsIndex++;
        } else if (lang === 'json') {
          detectedPath = 'package.json';
        } else if (lang === 'py' || lang === 'python') {
          detectedPath = 'main.py';
        } else if (lang === 'rs' || lang === 'rust') {
          detectedPath = 'src/main.rs';
        } else if (lang === 'go') {
          detectedPath = 'main.go';
        }
      }

      if (detectedPath) {
        filesMap.set(detectedPath, codeContent);
      }
    }
  }

  return Array.from(filesMap.entries()).map(([relativePath, content]) => ({ relativePath, content }));
}

/**
 * Moteur de Génération d'Artefacts de Projets complets prêts à l'emploi (Multi-Fichiers & Arborescence)
 */
export function buildProjectArtifact(
  projectName: string,
  targetLang: TargetLanguage,
  compiledCode: string,
  iplCode: string
): ProjectArtifact {
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  let files: ProjectArtifactFile[] = [];

  if (!compiledCode || !compiledCode.trim()) {
    return {
      projectName,
      targetLang,
      files: []
    };
  }

  // Tenter de découper le code compilé si le LLM a renvoyé des balises <file path="...">
  const parsedFiles = parseMultiFileXml(compiledCode);
  if (parsedFiles.length > 0) {
    files = parsedFiles;
  }

  // Si aucun bloc <file> n'a été trouvé, construire la structure canonique par défaut
  if (files.length === 0) {
    if (targetLang === 'rust') {
      files.push({
        relativePath: 'Cargo.toml',
        content: `[package]\nname = "${safeName}"\nversion = "0.1.0"\nedition = "2021"\nauthors = ["IPL Studio v1.0 <atelier@ipl.io>"]\n\n[dependencies]\ntokio = { version = "1.0", features = ["full"] }\nserde = { version = "1.0", features = ["derive"] }\nserde_json = "1.0"\n`
      });
      files.push({
        relativePath: 'src/main.rs',
        content: compiledCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Projet Rust - ${projectName}\n\nArtefact généré par **IPL Studio v1.0**.\n\n## Exécution\n\`\`\`bash\ncargo run\n\`\`\`\n`
      });
      files.push({
        relativePath: 'run.bat',
        content: `@echo off\ntitle Launching ${projectName} (Rust)...\ncargo run\npause\n`
      });
    } else if (targetLang === 'python') {
      files.push({
        relativePath: 'main.py',
        content: compiledCode
      });
      files.push({
        relativePath: 'requirements.txt',
        content: `# Dépendances générées pour ${projectName}\nasyncio\nrequests\n`
      });
      files.push({
        relativePath: 'README.md',
        content: `# Projet Python - ${projectName}\n\nArtefact généré par **IPL Studio v1.0**.\n\n## Exécution\n\`\`\`bash\npython main.py\n\`\`\`\n`
      });
      files.push({
        relativePath: 'run.bat',
        content: `@echo off\ntitle Launching ${projectName} (Python)...\npython main.py\npause\n`
      });
    } else if (targetLang === 'javascript') {
      files.push({
        relativePath: 'package.json',
        content: JSON.stringify({
          name: safeName,
          version: '1.0.0',
          description: `Projet JavaScript généré par IPL Studio`,
          main: 'index.js',
          scripts: { start: 'node index.js' },
          author: 'IPL Studio v1.0'
        }, null, 2)
      });
      files.push({
        relativePath: 'index.js',
        content: compiledCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Projet JavaScript - ${projectName}\n\nArtefact généré par **IPL Studio v1.0**.\n\n## Exécution\n\`\`\`bash\nnode index.js\n\`\`\`\n`
      });
    } else if (targetLang === 'go') {
      files.push({
        relativePath: 'go.mod',
        content: `module ${safeName}\n\ngo 1.20\n`
      });
      files.push({
        relativePath: 'main.go',
        content: compiledCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Projet Go - ${projectName}\n\nArtefact généré par **IPL Studio v1.0**.\n\n## Exécution\n\`\`\`bash\ngo run main.go\n\`\`\`\n`
      });
    } else if (targetLang === 'cpp') {
      files.push({
        relativePath: 'CMakeLists.txt',
        content: `cmake_minimum_required(VERSION 3.15)\nproject(${safeName} CXX)\n\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_executable(${safeName} main.cpp)\n`
      });
      files.push({
        relativePath: 'main.cpp',
        content: compiledCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Projet C++ 20 - ${projectName}\n\nArtefact généré par **IPL Studio v1.0**.\n`
      });
    } else if (targetLang === 'html') {
      files.push({
        relativePath: 'index.html',
        content: compiledCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Application Web HTML5 - ${projectName}\n\nOuvrez \`index.html\` dans n'importe quel navigateur.\n`
      });
    } else {
      files.push({
        relativePath: 'main.pll',
        content: compiledCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Artefact PLL v2 - ${projectName}\n`
      });
    }
  }

  // Fichier source IPL toujours inclus dans source/
  if (!files.some(f => f.relativePath === 'source/main.ipl')) {
    files.push({
      relativePath: 'source/main.ipl',
      content: iplCode
    });
  }

  return {
    projectName,
    targetLang,
    files
  };
}

/**
 * Exporte l'artefact complet du projet sous forme d'archive .zip téléchargeable
 */
export async function downloadProjectZip(
  projectName: string,
  targetLang: TargetLanguage,
  compiledCode: string,
  iplCode: string
): Promise<void> {
  const artifact = buildProjectArtifact(projectName, targetLang, compiledCode, iplCode);
  const zip = new JSZip();

  const folderName = `${projectName.toLowerCase().replace(/\s+/g, '_')}_${targetLang}`;
  const rootFolder = zip.folder(folderName)!;

  artifact.files.forEach(file => {
    rootFolder.file(file.relativePath, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${folderName}_artifact.zip`);
}
