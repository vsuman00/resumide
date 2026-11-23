import re,json,hashlib
from pathlib import Path
root=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats')
current={};declarations={};origins={};errors=[]
for f in sorted((root/'supabase/migrations').glob('*.sql')):
 if f.name>='20261115162257':continue
 text=f.read_text()
 for m in re.finditer(r'create(?: or replace)? function ([a-z_]+\.[a-z_]+)\(',text,re.I):
  b=re.search(r'\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',text[m.start():],re.I)
  if b:current[m[1]]=b[2];declarations[m[1]]=text[m.start():m.start()+b.start(2)];origins[m[1]]=f.name
 for m in re.finditer(r'\$([A-Za-z0-9_]+)\$(\[[\s\S]*?\])\$\1\$',text):
  try:rows=json.loads(m[2])
  except json.JSONDecodeError:continue
  for row in rows:
   n=row.get('signature','').split('(')[0] if isinstance(row,dict) else ''
   if n not in current:continue
   if isinstance(row.get('old'),str) and isinstance(row.get('new'),str):
    if current[n]!=row['old']:errors.append((f.name,n,'preimage'))
    current[n]=row['new'];origins[n]=f.name
   if isinstance(row.get('patches'),list):
    for change in row['patches']:
     if not isinstance(change.get('old'),str) or not isinstance(change.get('new'),str):continue
     if 'count' in change and current[n].count(change['old'])!=change['count']:errors.append((f.name,n,'substring'))
     current[n]=current[n].replace(change['old'],change['new']);origins[n]=f.name
