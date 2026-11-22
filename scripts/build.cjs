const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🛡️ 0. Scanning UI code for hardcoded Vietnamese strings (i18n Guard)...');
execSync('node scripts/check-hardcoded-i18n.cjs', { stdio: 'inherit' });

console.log('🔍 0.5. Running TypeScript Type Check on Homepage Sections (tsc --noEmit)...');
try {
  execSync('cmd /c npx -y tsc -p tsconfig.homepage.json --noEmit', { stdio: 'inherit' });
} catch (err) {
  console.error('❌ [Build Error] TypeScript strict type check failed! Please fix all type errors before building.');
  process.exit(1);
}

console.log('📦 1. Building Vite Frontend...');
const distAssets = path.join(__dirname, '..', 'dist', 'assets');
if (fs.existsSync(distAssets)) {
  fs.rmSync(distAssets, { recursive: true, force: true });
}
execSync('npx vite build', { stdio: 'inherit' });

console.log('⚡ 2. Compiling Cloudflare Pages Edge Worker bundle...');
let commitHash = process.env.COMMIT_HASH || process.env.CF_PAGES_COMMIT_SHA || '';
if (!commitHash) {
  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {}
}
if (!commitHash) commitHash = 'unknown';

try {
  const isDirty = execSync('git status --porcelain').toString().trim().length > 0;
  if (isDirty) {
    console.warn(`⚠️ [Build Warning] Git working tree has uncommitted changes! Active HEAD is ${commitHash}. If this is a release build, commit first before deploying.`);
  }
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
