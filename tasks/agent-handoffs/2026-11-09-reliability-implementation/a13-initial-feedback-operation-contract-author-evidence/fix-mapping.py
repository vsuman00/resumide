from pathlib import Path
p=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats/app/lib/server/initial-feedback-operation-contract.ts')
s=p.read_text();start=s.index('        const parts = p.ownedSupport.parts;');end=s.index('\n      }\n    } else {',start)
s=s[:start]+'''        const plan=p.plan,prose=p.prose,observation=p.recordedObservation,support=p.ownedSupport,parts=support.parts;
        const categories=["toneAndStyle","content","structure","skills"] as const;
        const expectedTips=categories.flatMap(category=>plan[category].map((x,retainedIndex)=>({category,originalIndex:x.originalIndex,retainedIndex})));
        const expectedBullets=plan.writer.bullets.map((x,retainedIndex)=>({originalIndex:x.originalIndex,retainedIndex}));
        const padding=categories.flatMap(category=>{
          const rows=[];
          for(let i=prose[category].tips.length;i<3;i++)rows.push({category,compatibilityIndex:i,origin:null,scope:"compatibility_only"});
          return rows;
        });
        issue(ctx,!isDeepStrictEqual(parts.tips.map(x=>({category:x.category,originalIndex:x.originalIndex,retainedIndex:x.retainedIndex})),expectedTips)
          ||!isDeepStrictEqual(parts.writer.bullets.map(x=>({originalIndex:x.originalIndex,retainedIndex:x.retainedIndex})),expectedBullets)
          ||!isDeepStrictEqual(support.mapping,{tips:expectedTips.map(x=>({...x,compatibilityIndex:x.retainedIndex})),bullets:expectedBullets,summary:plan.writer.summary===null?null:{retainedIndex:0},padding}));
        issue(ctx,parts.tips.length!==observation.items.filter(x=>x.retained).length||parts.writer.bullets.length!==prose.writer.bullets.length);
        for(const part of parts.tips) {
          const row=prose[part.category].tips[part.retainedIndex],obs=observation.items.find(x=>x.category===part.category&&x.index===part.originalIndex&&x.retained),planned=plan[part.category].find(x=>x.originalIndex===part.originalIndex);
          issue(ctx,!row||!obs||!planned||!obs.citation||part.type!==row.type||part.kind!==obs.kind||part.state!==obs.state||part.reason!==obs.reason||part.type!==obs.type
            ||!isDeepStrictEqual(part.quote,planned.quote)||hash(row.quote)!==planned.quote.textSha256
            ||obs.citation.start!==planned.quote.start||obs.citation.end!==planned.quote.end||obs.citation.quoteSha256!==planned.quote.textSha256
            ||part.title.textSha256!==hash(row.tip)||part.explanation.textSha256!==hash(row.explanation));
          for(const key of ["title","explanation"] as const)
            issue(ctx,part[key].textSha256!==obs?.[key].textSha256||part[key].kind!==obs?.[key].kind||part[key].state!==obs?.[key].state||part[key].reason!==obs?.[key].reason);
        }
        for(const part of parts.writer.bullets) {
          const row=prose.writer.bullets[part.retainedIndex],obs=observation.writer.bullets.find(x=>x.index===part.originalIndex&&x.retained),planned=plan.writer.bullets.find(x=>x.originalIndex===part.originalIndex);
          issue(ctx,!row||!obs||!planned||!isDeepStrictEqual(part.original,planned.original)||hash(row.original)!==planned.original.textSha256
            ||part.rewrite.textSha256!==hash(row.rewrite)||part.reasoning.textSha256!==hash(row.reasoning));
          for(const key of ["rewrite","reasoning"] as const)
            issue(ctx,part[key].textSha256!==obs?.[key].textSha256||part[key].kind!==obs?.[key].kind||part[key].state!==obs?.[key].state||part[key].reason!==obs?.[key].reason);
        }
        const summary=parts.writer.summary,observedSummary=observation.writer.summary;
        issue(ctx,(summary===null)!==(prose.writer.summary===null));
        if(summary)issue(ctx,!observedSummary||summary.textSha256!==hash(prose.writer.summary??"")||summary.textSha256!==observedSummary.textSha256||summary.kind!==observedSummary.kind||summary.state!==observedSummary.state||summary.reason!==observedSummary.reason);
        const proofParts=[...parts.tips.flatMap(x=>[x.title,x.explanation]),...parts.writer.bullets.flatMap(x=>[x.rewrite,x.reasoning]),...(summary?[summary]:[])];
        for(const part of proofParts)issue(ctx,part.sourceRefs.length===0||new Set(part.sourceRefs.map(x=>`${x.start}:${x.end}:${x.textSha256}`)).size!==part.sourceRefs.length);
''' +s[end:]
s=s.replace('const text = (max: number) => z.string().min(1).max(max).refine(utf8);\n','')
p.write_text(s)
