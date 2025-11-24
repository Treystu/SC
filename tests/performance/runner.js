#!/usr/bin/env node
/**
 * Performance test runner
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runPerformanceTests() {
  console.log('Running performance tests...\n');

  const testsDir = __dirname;
  const resultsDir = path.join(__dirname, '../../performance-results');

  // Create results directory
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const resultsFile = path.join(resultsDir, `results-${timestamp}.json`);

  const results = {
    timestamp,
    tests: [],
  };

  // Find all performance test files
  const testFiles = fs
    .readdirSync(testsDir)
    .filter((file) => file.endsWith('.ts') && file !== 'runner.js');

  for (const testFile of testFiles) {
    console.log(`Running ${testFile}...`);
    try {
      const testPath = path.join(testsDir, testFile);
      
      // Run with ts-node
      const output = execSync(
        `npx ts-node ${testPath}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      
      console.log(output);
      
      results.tests.push({
        name: testFile,
        status: 'passed',
        output,
      });
    } catch (error) {
      console.error(`Failed: ${testFile}`);
      console.error(error.stdout || error.message);
      
      results.tests.push({
        name: testFile,
        status: 'failed',
        error: error.stdout || error.message,
      });
    }
    console.log('');
  }

  // Save results
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${resultsFile}`);

  // Summary
  const passed = results.tests.filter((t) => t.status === 'passed').length;
  const failed = results.tests.filter((t) => t.status === 'failed').length;
  
  console.log('\nSummary:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${results.tests.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

runPerformanceTests().catch((error) => {
  console.error('Performance tests failed:', error);
  process.exit(1);
});
