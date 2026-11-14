import fs from 'fs';
import path from 'path';

function stripImportsAndExports(code) {
  return code
    // Remove import lines
    .replace(/^\s*import\s+.*?['"].*?['"];?\s*$/gm, '')
    // Replace export class / export function / export default
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+class\s+/gm, 'class ')
    .replace(/^\s*export\s+function\s+/gm, 'function ')
    .replace(/^\s*export\s+const\s+/gm, 'const ')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
}

const files = [
  'js/engine/prng.js',
  'js/engine/event-queue.js',
  'js/protocols/base-protocol.js',
  'js/protocols/stop-and-wait.js',
  'js/protocols/go-back-n.js',
  'js/protocols/selective-repeat.js',
  'js/engine/simulation-core.js',
  'js/ui/liquid-glass.js',
  'js/ui/stage-visualizer.js',
  'js/ui/ladder-visualizer.js',
  'js/app.js'
];

let bundleContent = '/* DEVNET — Self-Contained Browser Application Bundle */\n(function() {\n"use strict";\n\n';

for (const file of files) {
  const filePath = path.resolve('d:/CN-Simulation', file);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = stripImportsAndExports(raw);
    bundleContent += `/* ─── File: ${file} ─── */\n` + cleaned + '\n\n';
  } else {
    console.warn(`File not found: ${filePath}`);
  }
}

bundleContent += '})();\n';

fs.writeFileSync('d:/CN-Simulation/js/app.bundle.js', bundleContent, 'utf8');
console.log('Successfully generated d:/CN-Simulation/js/app.bundle.js');

