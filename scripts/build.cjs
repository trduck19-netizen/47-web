const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 1. Building Vite Frontend...');
execSync('npx vite build', { stdio: 'inherit' });

console.log('⚡ 2. Compiling Cloudflare Pages Edge Worker bundle...');
let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}
const buildTime = new Date().toISOString();
console.log(`   🏷️ Injected Build ID: ${commitHash} (${buildTime})`);
execSync(`npx esbuild functions/_worker.ts --bundle --target=es2022 --format=esm --define:__BUILD_ID__="'${commitHash}'" --define:__BUILD_TIME__="'${buildTime}'" --outfile=dist/_worker.js`, { stdio: 'inherit' });

console.log('📄 3. Ensuring _routes.json in dist/ ...');
const routesSrc = path.join(__dirname, '..', 'public', '_routes.json');
const routesDist = path.join(__dirname, '..', 'dist', '_routes.json');
if (fs.existsSync(routesSrc)) {
  fs.copyFileSync(routesSrc, routesDist);
  console.log('   _routes.json copied to dist/_routes.json');
}

console.log('✅ Build completed successfully with active Cloudflare Edge Worker bundle (dist/_worker.js)!');
