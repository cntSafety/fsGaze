const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the parent directory of the current script's directory
const rootDir = path.resolve(__dirname, '..');
console.log(`Root directory: ${rootDir}`);

// Output file path - save in the same directory as the script
const outputFile = path.join(__dirname, 'imports-diagram.md');
console.log(`Output will be saved to: ${outputFile}`);

// Function to extract just the filename without extension
function getFileName(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

// Function to get a more descriptive file name that includes parent directory for common filenames
function getDescriptiveFileName(filePath) {
  const fileName = path.basename(filePath, path.extname(filePath));
  
  // List of common file names that need path context
  const commonFileNames = ['page', 'index', 'layout', 'component', 'utils', 'types'];
  
  if (commonFileNames.includes(fileName.toLowerCase())) {
    // Get the parent directory name
    const parentDir = path.basename(path.dirname(filePath));
    // Return a combination of parent directory and filename
    return `${parentDir}/${fileName}`;
  }
  
  return fileName;
}

// Function to find all .js, .ts, and .tsx files recursively
function findFiles(dir, fileList = []) {
  console.log(`Scanning directory: ${dir}`);
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('node_modules') && !file.startsWith('.') && file !== 'dev_scripts') {
      fileList = findFiles(filePath, fileList);
    } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx'))) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Function to normalize a path for display
function normalizePath(filePath) {
  return filePath.replace(rootDir, '').replace(/\\/g, '/').replace(/^\//, '');
}

// Function to normalize import paths
function normalizeImportPath(importPath, currentFilePath) {
  // Handle @/ imports
  if (importPath.startsWith('@/')) {
    return importPath.substring(2);
  }
  
  // Handle relative imports by resolving the path
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const currentDir = path.dirname(currentFilePath);
    const resolvedPath = path.resolve(currentDir, importPath);
    
    // Try to match with common extensions if the import doesn't include one
    if (!path.extname(importPath)) {
      const extensions = ['.js', '.jsx', '.ts', '.tsx'];
      for (const ext of extensions) {
        if (fs.existsSync(`${resolvedPath}${ext}`)) {
          return `${resolvedPath}${ext}`;
        }
      }
      // If no file with extension is found, try folder/index
      for (const ext of extensions) {
        if (fs.existsSync(path.join(resolvedPath, `index${ext}`))) {
          return path.join(resolvedPath, `index${ext}`);
        }
      }
    }
    return resolvedPath;
  }
  
  // Return as is for other imports
  return importPath;
}

// Function to check if an import should be excluded
function shouldExcludeImport(importPath) {
  const excludePatterns = [
    'react',
    'react_icons',
    'react-icons',
    'dev_scripts',
  ];
  
  return excludePatterns.some(pattern => 
    importPath.toLowerCase().includes(pattern.toLowerCase())
  );
}

// Function to extract imports from a file
function extractImports(filePath) {
  console.log(`Analyzing imports in: ${normalizePath(filePath)}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = [];
  
  // Regular imports: import X from 'path'
  const importRegex = /import\s+(?:{([^}]+)}|([^\s{]+))\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const rawImportPath = match[3];
    const importPath = normalizeImportPath(rawImportPath, filePath);
    
    // Skip excluded imports
    if (shouldExcludeImport(importPath)) {
      console.log(`Skipping excluded import: ${importPath}`);
      continue;
    }
    
    const namedImports = match[1] ? match[1].split(',').map(i => i.trim()) : [];
    const defaultImport = match[2] ? [match[2].trim()] : [];
    
    // Combine all imports
    const allImports = [...defaultImport, ...namedImports];
    
    allImports.forEach(imp => {
      // Clean up named imports like { X as Y }
      const cleanImport = imp.split(' as ')[0].trim();
      if (cleanImport) {
        imports.push({
          name: cleanImport,
          path: importPath,
          rawPath: rawImportPath
        });
      }
    });
  }
  
  // Dynamic imports: import('path')
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const rawImportPath = match[1];
    const importPath = normalizeImportPath(rawImportPath, filePath);
    
    // Skip excluded imports
    if (shouldExcludeImport(importPath)) {
      console.log(`Skipping excluded dynamic import: ${importPath}`);
      continue;
    }
    
    imports.push({
      name: 'dynamic',
      path: importPath,
      rawPath: rawImportPath
    });
  }
  
  return imports;
}

// Function to create a Mermaid-safe version of a node name
function getMermaidNodeName(name) {
  if (!name) return 'unnamed_node';
  
  // Create a completely unique node ID format that's Mermaid compatible
  // and clearly shows the path structure
  let parts = name.split('/');
  
  if (parts.length > 1) {
    // For path-based names, create a clearer representation
    return `${parts[0]}_${parts[1]}`;
  }
  
  // Handle spaces and special characters
  let cleanedName = name.replace(/[\s\-\+\/\(\)\.\,\'\"\:\;\!\@\#\$\%\^\&\*\=]/g, '_');
  
  // Remove consecutive underscores
  cleanedName = cleanedName.replace(/_+/g, '_');
  
  // Remove leading and trailing underscores
  cleanedName = cleanedName.replace(/^_+|_+$/g, '');
  
  // Make sure the name starts with a letter
  if (!/^[a-zA-Z]/.test(cleanedName)) {
    cleanedName = 'n_' + cleanedName;
  }
  
  // Handle reserved words
  const reservedWords = ['graph', 'click', 'subgraph', 'end', 'link', 'style', 
                        'classDef', 'class', 'direction', 'flowchart', 'top', 
                        'bottom', 'right', 'left'];
  
  if (reservedWords.includes(cleanedName.toLowerCase())) {
    cleanedName = 'node_' + cleanedName;
  }
  
  return cleanedName;
}

// Generate the Mermaid diagram
function generateMermaidDiagram(fileImports) {
  console.log('Generating Mermaid diagram...');
  let mermaidContent = '```mermaid\ngraph LR\n';
  
  // Track file paths to file names for the mapping table
  const filePathToName = new Map();
  // Create a map from original name to display name (with slashes)
  const nameToDisplayName = new Map();
  // Create a map from original name to Mermaid-safe node ID
  const nameToNodeId = new Map();
  
  // First pass: collect all file names and their versions
  fileImports.forEach(file => {
    // Use the descriptive file name instead of just the basename
    const sourceFileName = getDescriptiveFileName(file.path);
    // Preserve original format with slash
    nameToDisplayName.set(sourceFileName, sourceFileName);
    // Create Mermaid-safe node ID
    nameToNodeId.set(sourceFileName, getMermaidNodeName(sourceFileName));
    filePathToName.set(sourceFileName, normalizePath(file.path));
  });
  
  // Collect target names from imports
  fileImports.forEach(file => {
    file.imports.forEach(imp => {
      let targetFileName;
      
      if (imp.rawPath.startsWith('./') || imp.rawPath.startsWith('../')) {
        const baseName = path.basename(imp.rawPath);
        const baseFileName = baseName.includes('.') ? 
          baseName.substring(0, baseName.lastIndexOf('.')) : 
          baseName;
          
        if (baseFileName === '') {
          const dirName = path.dirname(imp.rawPath);
          targetFileName = path.basename(dirName);
        } else {
          // Check if this is a common filename and we can extract more path info
          if (['page', 'index', 'layout', 'component', 'utils', 'types'].includes(baseFileName.toLowerCase())) {
            const importPath = path.dirname(imp.rawPath);
            const importDirName = path.basename(importPath);
            if (importDirName && importDirName !== '.') {
              targetFileName = `${importDirName}/${baseFileName}`;
            } else {
              targetFileName = baseFileName;
            }
          } else {
            targetFileName = baseFileName;
          }
        }
      } else {
        targetFileName = getDescriptiveFileName(imp.path);
      }
      
      if (targetFileName) {
        const sanitizedName = getMermaidNodeName(targetFileName);
        nameToDisplayName.set(targetFileName, targetFileName);
        nameToNodeId.set(targetFileName, sanitizedName);
        filePathToName.set(targetFileName, imp.path);
      }
    });
  });
  
  // Second pass: add edges with Mermaid-safe node IDs
  fileImports.forEach(file => {
    const sourceFileName = getDescriptiveFileName(file.path);
    const sourceNodeId = nameToNodeId.get(sourceFileName);
    
    file.imports.forEach(imp => {
      let targetFileName;
      
      if (imp.rawPath.startsWith('./') || imp.rawPath.startsWith('../')) {
        const baseName = path.basename(imp.rawPath);
        const baseFileName = baseName.includes('.') ? 
          baseName.substring(0, baseName.lastIndexOf('.')) : 
          baseName;
          
        if (baseFileName === '') {
          const dirName = path.dirname(imp.rawPath);
          targetFileName = path.basename(dirName);
        } else {
          // Check if this is a common filename and we can extract more path info
          if (['page', 'index', 'layout', 'component', 'utils', 'types'].includes(baseFileName.toLowerCase())) {
            const importPath = path.dirname(imp.rawPath);
            const importDirName = path.basename(importPath);
            if (importDirName && importDirName !== '.') {
              targetFileName = `${importDirName}/${baseFileName}`;
            } else {
              targetFileName = baseFileName;
            }
          } else {
            targetFileName = baseFileName;
          }
        }
      } else {
        targetFileName = getDescriptiveFileName(imp.path);
      }
      
      if (!targetFileName) {
        console.log(`Skipping import with undefined target: ${imp.rawPath}`);
        return;
      }
      
      const targetNodeId = nameToNodeId.get(targetFileName);
      const label = imp.name;
      
      mermaidContent += `  ${sourceNodeId} -- "${label}" --> ${targetNodeId}\n`;
    });
  });
  
  mermaidContent += '```\n';
  
  // Add a legend for node names
  mermaidContent += '\n## File Name Mapping\n\n';
  mermaidContent += '| Node ID | Original Name | File Path |\n';
  mermaidContent += '| ------- | ------------- | --------- |\n';
  
  // Sort the entries by node name
  const sortedEntries = Array.from(filePathToName.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  sortedEntries.forEach(([nodeName, filePath]) => {
    const displayName = nameToDisplayName.get(nodeName);
    const nodeId = nameToNodeId.get(nodeName);
    
    // For clarity in the table, show paths with slashes
    let formattedDisplayName = displayName;
    
    // Fix for path-based names to ensure they show properly in the table
    if (nodeName.includes('/')) {
      formattedDisplayName = nodeName;
    }
    
    mermaidContent += `| ${nodeId} | ${formattedDisplayName} | ${filePath} |\n`;
  });
  
  console.log(`Diagram created with ${filePathToName.size} unique nodes`);
  return mermaidContent;
}

// Main function
function main() {
  console.log('Starting import analysis...');
  console.log(`Scanning files in: ${rootDir}`);
  const files = findFiles(rootDir);
  console.log(`Found ${files.length} JavaScript and TypeScript files`);
  
  console.log('Extracting imports from files...');
  const fileImports = files.map(file => {
    return {
      path: file,
      imports: extractImports(file)
    };
  });
  
  console.log('Building Markdown document...');
  const markdown = `# Project Import Diagram\n\nGenerated on ${new Date().toISOString().split('T')[0]}\n\n` + 
                  generateMermaidDiagram(fileImports);
  
  fs.writeFileSync(outputFile, markdown);
  console.log(`Diagram generated successfully at: ${outputFile}`);
  console.log('Script completed!');
}

main();