const { execSync } = require('child_process');

try {
  const out = execSync('npx wrangler d1 execute 47webdanganh --remote --command "SELECT 1 as val;"', {
    cwd: __dirname,
    encoding: 'utf8'
  });
  console.log('OUTPUT:', out);
} catch (err) {
  console.log('ERROR STATUS:', err.status);
  console.log('STDERR:', err.stderr ? err.stderr.toString() : '');
  console.log('STDOUT:', err.stdout ? err.stdout.toString() : '');
}
