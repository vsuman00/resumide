import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const root=process.cwd(), tmp=mkdtempSync(join(tmpdir(),'resumide-decisions-cli-'));mkdirSync(join(tmp,'home'));
const git=execFileSync('/usr/bin/git',['rev-parse','--git-common-dir'],{encoding:'utf8'}).trim();
const common=git.startsWith('/')?git:join(root,git);
const roots=[root,...['backend','frontend','runtime'].map(x=>`/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-${x}/resume_ats`)];
const policy='(version 1)\n(allow default)\n(deny network*)\n(deny file-write* (subpath '+JSON.stringify(common)+'))\n'+roots.map(r=>'(deny file-write* (literal '+JSON.stringify(join(r,'.git'))+'))\n'+['.env','.env.local','.env.test','.env.test.local','.env.development','.env.development.local','.env.production','.env.production.local'].map(n=>'(deny file-read* (literal '+JSON.stringify(join(r,n))+'))\n').join('')).join('');
const env={HOME:join(tmp,'home'),PATH:dirname(process.execPath)+':/usr/bin:/bin:/usr/sbin:/sbin',NO_UPDATE_NOTIFIER:'1',SUPABASE_TELEMETRY_DISABLED:'true',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0',LANG:'en_US.UTF-8'};
const calls=[];for(const args of [['--version'],['--help'],['migration','--help'],['migration','new','--help']]){const out=execFileSync('/usr/bin/sandbox-exec',['-p',policy,join(root,'node_modules/@supabase/cli-darwin-arm64/bin/supabase'),...args],{cwd:tmp,env,encoding:'utf8',timeout:10000,maxBuffer:1048576});calls.push({args,output:out});}
if(calls[0].output.trim()!=='2.117.0')throw Error('Pinned CLI mismatch');
const report={status:'HELP_VERSION_ONLY',databaseOperations:0,network:'OS_DENIED',policy,calls};writeFileSync(join(root,'tasks/agent-handoffs/2026-11-09-reliability-implementation/decisions-cli-discovery.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version:calls[0].output.trim(),helpCommands:calls.length-1,temporary:tmp}));
