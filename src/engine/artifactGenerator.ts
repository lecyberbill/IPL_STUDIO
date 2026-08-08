import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { TargetLanguage } from './llmGenerator';

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
 * Applies a targeted SEARCH/REPLACE patch block onto an existing file's content
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
 * Ultra-robustly extracts files packed as <file path="..."> tags
 * or applies targeted line patches via <patch path="..."> tags
 */
export function parseMultiFileXml(rawOutput: string, existingFiles: ProjectArtifactFile[] = []): ProjectArtifactFile[] {
  const filesMap = new Map<string, string>();

  // Keep existing files if provided
  for (const ef of existingFiles) {
    filesMap.set(ef.relativePath, ef.content);
  }

  // 1. Extract and apply targeted line patches via <patch path="..."> tags
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

  // 2. Extract full files as <file path="..."> tags
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
    
    // If a closing </file> tag is present, truncate the content exactly at the tag
    const closeTagIndex = rawContent.indexOf('</file>');
    if (closeTagIndex !== -1) {
      rawContent = rawContent.substring(0, closeTagIndex);
    }
    
    // Clean up trailing markdown code fences if any
    rawContent = rawContent.replace(/```\s*$/i, '');

    const cleanContent = rawContent.trim();
    if (current.path && cleanContent) {
      filesMap.set(current.path, cleanContent);
    }
  }

  // 3. FALLBACK: If no <file> tags were detected, extract Markdown code blocks (```lang ... ```)
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

      // Look for a filename at the start of the block (e.g. <!-- css/styles.css --> or /* css/styles.css */ or // js/app.js)
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
 * Full ready-to-use multi-file project artifact generator (Multi-Files & Folder Tree)
 */
export function buildProjectArtifact(
  projectName: string,
  targetLang: TargetLanguage,
  generatedCode: string,
  iplCode: string
): ProjectArtifact {
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  let files: ProjectArtifactFile[] = [];

  if (!generatedCode || !generatedCode.trim()) {
    return {
      projectName,
      targetLang,
      files: []
    };
  }

  // Try to split generated code if the LLM returned <file path="..."> tags
  const parsedFiles = parseMultiFileXml(generatedCode);
  if (parsedFiles.length > 0) {
    files = parsedFiles;
  }

  // If no <file> blocks found, build the default canonical structure
  if (files.length === 0) {
    if (targetLang === 'rust') {
      files.push({
        relativePath: 'Cargo.toml',
        content: `[package]\nname = "${safeName}"\nversion = "0.1.0"\nedition = "2021"\nauthors = ["IPL Studio v1.0 <atelier@ipl.io>"]\n\n[dependencies]\ntokio = { version = "1.0", features = ["full"] }\nserde = { version = "1.0", features = ["derive"] }\nserde_json = "1.0"\n`
      });
      files.push({
        relativePath: 'src/main.rs',
        content: generatedCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Rust Project - ${projectName}\n\nArtifact generated by **IPL Studio v1.0**.\n\n## Run\n\`\`\`bash\ncargo run\n\`\`\`\n`
      });
      files.push({
        relativePath: 'run.bat',
        content: `@echo off\ntitle Launching ${projectName} (Rust)...\ncargo run\npause\n`
      });
    } else if (targetLang === 'python') {
      files.push({
        relativePath: 'main.py',
        content: generatedCode
      });
      files.push({
        relativePath: 'requirements.txt',
        content: `# Dependencies generated for ${projectName}\nasyncio\nrequests\n`
      });
      files.push({
        relativePath: 'README.md',
        content: `# Python Project - ${projectName}\n\nArtifact generated by **IPL Studio v1.0**.\n\n## Run\n\`\`\`bash\npython main.py\n\`\`\`\n`
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
          description: `JavaScript project generated by IPL Studio`,
          main: 'index.js',
          scripts: { start: 'node index.js' },
          author: 'IPL Studio v1.0'
        }, null, 2)
      });
      files.push({
        relativePath: 'index.js',
        content: generatedCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# JavaScript Project - ${projectName}\n\nArtifact generated by **IPL Studio v1.0**.\n\n## Run\n\`\`\`bash\nnode index.js\n\`\`\`\n`
      });
    } else if (targetLang === 'go') {
      files.push({
        relativePath: 'go.mod',
        content: `module ${safeName}\n\ngo 1.20\n`
      });
      files.push({
        relativePath: 'main.go',
        content: generatedCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# Go Project - ${projectName}\n\nArtifact generated by **IPL Studio v1.0**.\n\n## Run\n\`\`\`bash\ngo run main.go\n\`\`\`\n`
      });
    } else if (targetLang === 'cpp') {
      files.push({
        relativePath: 'CMakeLists.txt',
        content: `cmake_minimum_required(VERSION 3.15)\nproject(${safeName} CXX)\n\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_executable(${safeName} main.cpp)\n`
      });
      files.push({
        relativePath: 'main.cpp',
        content: generatedCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# C++ 20 Project - ${projectName}\n\nArtifact generated by **IPL Studio v1.0**.\n`
      });
    } else if (targetLang === 'html') {
      files.push({
        relativePath: 'index.html',
        content: generatedCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# HTML5 Web Application - ${projectName}\n\nOpen \`index.html\` in any browser.\n`
      });
    } else {
      files.push({
        relativePath: 'main.pll',
        content: generatedCode
      });
      files.push({
        relativePath: 'README.md',
        content: `# PLL v2 Artifact - ${projectName}\n`
      });
    }
  }

  // IPL source file always included under source/
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
 * Exports the full project artifact as a downloadable .zip archive
 */
export async function downloadProjectZip(
  projectName: string,
  targetLang: TargetLanguage,
  generatedCode: string,
  iplCode: string
): Promise<void> {
  const artifact = buildProjectArtifact(projectName, targetLang, generatedCode, iplCode);
  const zip = new JSZip();

  const folderName = `${projectName.toLowerCase().replace(/\s+/g, '_')}_${targetLang}`;
  const rootFolder = zip.folder(folderName)!;

  artifact.files.forEach(file => {
    rootFolder.file(file.relativePath, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${folderName}_artifact.zip`);
}
