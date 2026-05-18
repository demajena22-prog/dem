import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const f of list) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') results = results.concat(walk(full));
    } else if (f.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = walk(root);
let errors = 0;

for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    errors++;
    const rel = path.relative(root, f);
    console.log(`❌ ${rel}`);
    console.log(`   ${e.stderr.toString().split('\n')[0]}`);
  }
}

if (!errors) {
  console.log(`✅ All ${files.length} JS files pass syntax check`);
} else {
  console.log(`\n${errors}/${files.length} file(s) have syntax errors`);
}
