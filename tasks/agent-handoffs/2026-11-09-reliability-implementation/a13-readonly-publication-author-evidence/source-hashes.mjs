import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export function sourceHashes(root) {
 const hashes={}, names=[];
 const denied=/(^|\/)(node_modules|\.git|build|dist|\.react-router|\.env[^/]*|\.npmrc|\.netrc|\.pypirc|private|\.private|secrets|\.secrets|credentials|(?:secrets?|credentials|private)\.json)(\/|$)/i;
 function walk(relative) { if(denied.test(relative)) return; const path=join(root,relative), s=lstatSync(path); if(s.isDirectory()) for(const n of readdirSync(path).sort())walk(join(relative,n)); else if(s.isFile())names.push(relative); }
 for(const name of readdirSync(root).sort()) if(/^(app|tests|scripts|e2e|types|public|supabase|benchmarks|assets|\.github)$/.test(name)||/^[^/]+\.(json|jsonc|js|mjs|cjs|ts|mts|cts|toml|ya?ml)$/.test(name)||/^(Dockerfile(\.[a-z0-9_-]+)?|\.dockerignore|\.gitignore|\.prettierignore)$/.test(name))walk(name);
 for(const name of names.sort()) { if(!(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|css|scss|html|sql|py|c|h|sh|toml|ya?ml|cnf|lock)$/.test(name)||/(^|\/)(Dockerfile(\.[a-z0-9_-]+)?|\.dockerignore|\.gitignore|\.prettierignore)$/.test(name)))continue; const bytes=readFileSync(join(root,name)); if(bytes.includes(0))continue; hashes[name]=createHash('sha256').update(bytes).digest('hex'); }
 return hashes;
}
