#!/usr/bin/env node
//
// Compiles the <script type="text/babel"> block in index.html ahead of time and
// writes a ready-to-serve copy into dist/.
//
// index.html at the repo root stays the readable source — the thing you edit
// and upload. Nothing about that changes. Vercel runs this on deploy and serves
// what comes out.
//
// The env preset is not optional. Browser Babel has been applying it all along,
// and compiling without it leaves const/let intact, which turns latent ordering
// mistakes into fatal errors at load. That is exactly what took the site down on
// 7 September.

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist');

// Files and folders that must never be copied into the build output.
const SKIP = new Set([
  'dist', 'node_modules', '.git', '.github', '.vercel', 'api',
  'build.js', 'package.json', 'package-lock.json', 'vercel.json',
  '.gitignore', 'README.md',
]);

function copyInto(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (srcDir === ROOT && SKIP.has(entry.name)) continue;
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyInto(from, to);
    else fs.copyFileSync(from, to);
  }
}

function fail(msg) {
  console.error('\nBuild failed: ' + msg + '\n');
  process.exit(1);
}

const srcPath = path.join(ROOT, 'index.html');
if (!fs.existsSync(srcPath)) fail('no index.html at the repo root.');

const html = fs.readFileSync(srcPath, 'utf8');

// --- locate the Babel block ------------------------------------------------
const openRe = /<script\b[^>]*type=["']text\/babel["'][^>]*>/i;
const open = html.match(openRe);
if (!open) fail('no <script type="text/babel"> block found in index.html.');

const startTag = open.index;
const codeStart = startTag + open[0].length;
const codeEnd = html.indexOf('</script>', codeStart);
if (codeEnd === -1) fail('the text/babel block is never closed.');

const jsx = html.slice(codeStart, codeEnd);
const jsxLines = jsx.split('\n').length;
console.log('Found ' + jsxLines.toLocaleString() + ' lines of JSX to compile.');

// --- compile ---------------------------------------------------------------
let compiled;
try {
  const result = babel.transformSync(jsx, {
    filename: 'index.jsx',
    babelrc: false,
    configFile: false,
    compact: false,
    comments: false,
    sourceMaps: false,
    presets: [
      // classic runtime: React.createElement, matching the UMD React on the page
      ['@babel/preset-react', { runtime: 'classic' }],
      // REQUIRED, and deliberately with no targets.
      //
      // @babel/standalone in the browser has been compiling with no targets,
      // which means full ES5: const and let become var, and async functions get
      // a regenerator runtime inlined as a helper. Setting a modern target here
      // would produce a smaller file but would NOT be the same code that has
      // been running in production. Parity first; size later, if wanted.
      ['@babel/preset-env', { useBuiltIns: false }],
    ],
  });
  compiled = result.code;
} catch (e) {
  fail('Babel could not compile the JSX.\n\n' + (e.message || e));
}

// A string containing </script> would close the tag early and break the page.
compiled = compiled.replace(/<\/script>/gi, '<\\/script>');

// --- sanity checks ---------------------------------------------------------
// Checked by parsing, not by searching the text: the word "let" appears inside
// ordinary English prose in this file's placeholder strings, and a text search
// finds those too.
try {
  const parser = require('@babel/parser');
  const ast = parser.parse(compiled, { sourceType: 'unambiguous', errorRecovery: false });
  let blockScoped = 0;
  JSON.stringify(ast, (k, v) => {
    if (v && v.type === 'VariableDeclaration' && (v.kind === 'const' || v.kind === 'let')) blockScoped++;
    return v;
  });
  if (blockScoped > 0) {
    fail(blockScoped + ' const/let declarations survived compilation — the env preset did not run. Refusing to build.');
  }
  console.log('Checked: no const/let left, output parses.');
} catch (e) {
  fail('the compiled output does not parse:\n\n' + (e.message || e));
}
if (!/React\.createElement|_jsx/.test(compiled)) {
  fail('no React.createElement in the output — the react preset did not run.');
}

// --- rebuild the page ------------------------------------------------------
let out = html.slice(0, startTag) + '<script>' + compiled + html.slice(codeEnd);

// The Babel CDN is only there to compile in the browser. Once compiled it is
// ~3MB of download doing nothing.
const before = out.length;
out = out.replace(/[ \t]*<script[^>]*@babel\/standalone[^>]*><\/script>\s*\n?/i, '');
if (out.length === before) {
  console.warn('Note: could not find the Babel CDN tag to remove. Left as is.');
}

copyInto(ROOT, OUT);
fs.writeFileSync(path.join(OUT, 'index.html'), out);

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log('Source:   ' + kb(html.length));
console.log('Built:    ' + kb(out.length) + '  -> dist/index.html');
console.log('Browser no longer downloads ~3 MB of Babel or compiles on load.');
