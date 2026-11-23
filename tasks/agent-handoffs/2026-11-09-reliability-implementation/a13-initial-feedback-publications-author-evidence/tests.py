from pathlib import Path
import json,re
w=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');packet=Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-publications-035socqv')
p=w/'tests/unit/initial-feedback-operation-sql.test.ts';s=p.read_text();old_profile=(packet/'operation-profile.baseline.txt').read_text() if (packet/'operation-profile.baseline.txt').exists() else ''
if not old_profile:
 print([x.name for x in packet.iterdir()]);raise Exception('baseline needed')
