#!/usr/bin/env node
/**
 * Test coverage analyzer
 * Generates a report of test coverage gaps
 */

const fs = require('fs');
const path = require('path');

const CORE_SRC = path.join(__dirname, '../../core/src');

function findSourceFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      findSourceFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && 
               !entry.name.endsWith('.test.ts') && 
               !entry.name.endsWith('.spec.ts') &&
               !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function hasTestFile(sourceFile) {
  const testFile = sourceFile.replace(/\.ts$/, '.test.ts');
  const specFile = sourceFile.replace(/\.ts$/, '.spec.ts');
  
  return fs.existsSync(testFile) || fs.existsSync(specFile);
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Count functions and classes
  const functions = (content.match(/^export\s+(async\s+)?function\s+/gm) || []).length;
  const classes = (content.match(/^export\s+class\s+/gm) || []).length;
  const interfaces = (content.match(/^export\s+interface\s+/gm) || []).length;
  
  return {
    lines: lines.length,
    functions,
    classes,
    interfaces,
    isEmpty: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length < 5,
  };
}

function generateReport() {
  console.log('Test Coverage Gap Analysis');
  console.log('===========================\n');
  
  const sourceFiles = findSourceFiles(CORE_SRC);
  const untested = [];
  const tested = [];
  
  for (const file of sourceFiles) {
    const relativePath = path.relative(CORE_SRC, file);
    const analysis = analyzeFile(file);
    
    if (hasTestFile(file)) {
      tested.push({ path: relativePath, ...analysis });
    } else {
      untested.push({ path: relativePath, ...analysis });
    }
  }
  
  // Sort by complexity (functions + classes)
  untested.sort((a, b) => {
    const complexityA = a.functions + a.classes;
    const complexityB = b.functions + b.classes;
    return complexityB - complexityA;
  });
  
  console.log(`Total source files: ${sourceFiles.length}`);
  console.log(`Files with tests: ${tested.length} (${((tested.length / sourceFiles.length) * 100).toFixed(1)}%)`);
  console.log(`Files without tests: ${untested.length} (${((untested.length / sourceFiles.length) * 100).toFixed(1)}%)\n`);
  
  console.log('Priority Files Needing Tests (by complexity):');
  console.log('==============================================\n');
  
  const priority = untested.filter(f => !f.isEmpty && (f.functions > 0 || f.classes > 0));
  
  for (let i = 0; i < Math.min(20, priority.length); i++) {
    const file = priority[i];
    console.log(`${i + 1}. ${file.path}`);
    console.log(`   Functions: ${file.functions}, Classes: ${file.classes}, Lines: ${file.lines}`);
  }
  
  console.log('\n\nCoverage Metrics:');
  console.log('=================\n');
  
  const totalFunctions = [...tested, ...untested].reduce((sum, f) => sum + f.functions, 0);
  const totalClasses = [...tested, ...untested].reduce((sum, f) => sum + f.classes, 0);
  const untestedFunctions = untested.reduce((sum, f) => sum + f.functions, 0);
  const untestedClasses = untested.reduce((sum, f) => sum + f.classes, 0);
  
  console.log(`Total Functions: ${totalFunctions}`);
  console.log(`Tested Functions (approx): ${totalFunctions - untestedFunctions} (${(((totalFunctions - untestedFunctions) / totalFunctions) * 100).toFixed(1)}%)`);
  console.log(`Total Classes: ${totalClasses}`);
  console.log(`Tested Classes (approx): ${totalClasses - untestedClasses} (${(((totalClasses - untestedClasses) / totalClasses) * 100).toFixed(1)}%)`);
}

generateReport();
