-- A13 PRIVATE PURE INITIAL FEEDBACK RENDERER. SOURCE ONLY, UNPARSED/UNEXECUTED.
-- Argument content validation only: no owned input lookup, publication, worker,
-- provider, score, storage or adoption. All private helpers remain denied.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create function private.ifp_fail(p_reason text) returns void
language plpgsql stable set search_path='' as $ifp_0$
begin
  if p_reason='resource' then raise exception 'INITIAL_FEEDBACK_PLAN_RESOURCE' using errcode='P0C03';
  elsif p_reason='unicode' then raise exception 'INITIAL_FEEDBACK_PLAN_UNICODE_INCOMPATIBLE' using errcode='P0C03';
  else raise exception 'INITIAL_FEEDBACK_PLAN_REFUSED' using errcode='22023';end if;
end;
$ifp_0$;

create function private.ifp_keys(p_value jsonb,p_keys text[]) returns boolean
language plpgsql stable set search_path='' as $ifp_1$
begin
  if jsonb_typeof(p_value) is distinct from 'object' then return false;end if;
  return (select array_agg(key collate "C" order by key collate "C") from jsonb_object_keys(p_value) key)
    is not distinct from (select array_agg(key collate "C" order by key collate "C") from unnest(p_keys) key);
end;
$ifp_1$;

create function private.ifp_sha(p_text text) returns text
language plpgsql stable set search_path='' as $ifp_2$
begin return encode(sha256(convert_to(p_text,'UTF8')),'hex');end;
$ifp_2$;

create function private.ifp_ascii_lower(p_text text) returns text
language plpgsql stable set search_path='' as $ifp_3$
begin return translate(p_text,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz');end;
$ifp_3$;

create function private.ifp_ws(p_text text) returns text
language plpgsql stable set search_path='' as $ifp_4$
declare chars text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
 chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
 chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
begin return translate(p_text,chars,repeat(' ',char_length(chars)));end;
$ifp_4$;

create function private.ifp_ref(p_source text,p_u16 integer[],p_start integer,p_end integer) returns jsonb
language plpgsql stable set search_path='' as $ifp_5$
begin
  if p_start<0 or p_end<=p_start or p_end>char_length(p_source) then perform private.ifp_fail('invalid');end if;
  return jsonb_build_object('start',p_start,'end',p_end,'textSha256',private.ifp_sha(substring(p_source from p_start+1 for p_end-p_start)));
end;
$ifp_5$;

create function private.ifp_basic(p_text text) returns text
language plpgsql stable set search_path='' as $ifp_6$
declare t text:=btrim(private.ifp_ws(p_text),' ');
begin
  -- Every admitted action/role begins in the explicit ASCII grammar. The native
  -- domain does not guess Unicode letter categories for a stripped bullet.
  t:=regexp_replace(t collate "C",'^[•●·▪–—-] +(?=[A-Za-z])','');
  t:=normalize(t,NFC);t:=regexp_replace(t collate "C",' +',' ','g');
  if (private.ifp_ascii_lower(t) collate "C")!~'https?://|mailto:' then t:=regexp_replace(t collate "C",'[.]$','');end if;
  return t;
end;
$ifp_6$;

create function private.ifp_normalize(p_text text,p_mode text) returns text
language plpgsql stable set search_path='' as $ifp_7$
declare t text:=private.ifp_basic(p_text);words text[];word text;token text;last text;punct text;result text[]:='{}';i integer;
 verbs text:='built|created|developed|designed|implemented|improved|reduced|increased|supported|helped|led|lead|managed|owned|maintained|worked';
 cues text[]:=array['argument','called','class','code','column','command','email','field','file','filename','function','identifier','key','literal','mailbox','method','metric','model','module','named','namespace','package','parameter','path','property','symbol','token','unit','url','variable'];
begin
  if (p_mode collate "C")='basic' then return t;end if;
  if (p_mode collate "C") is distinct from 'admitted_prose' then perform private.ifp_fail('invalid');end if;
  if (t collate "C")!~*('^(?:(?:I|We) +)?(?:(?:did +not|never) +)?('||verbs||')(?=$|[^A-Za-z0-9_])') then return t;end if;
  if (t collate "C")~'[0-9`"''“”‘’\\/<>\[\]{}=:@_$#|*]' then return t;end if;
  if (t collate "C")!~'[­ﬀﬁﬂﬃﬄﬅﬆ]' then return t;end if;
  -- No POSIX/locale Unicode-category approximation: uncertain non-ASCII
  -- numeric/letter context refuses when typography folding would be needed.
  if (t collate "C")~'[^\x01-\x7f­ﬀﬁﬂﬃﬄﬅﬆ]' then perform private.ifp_fail('unicode');end if;
  words:=string_to_array(t,' ');
  for i in 1..coalesce(array_length(words,1),0) loop
    word:=words[i];last:=case when i>1 then regexp_replace(private.ifp_ascii_lower(words[i-1]) collate "C",'[.,;!?]$','') else null end;
    if (word collate "C")~'^[a-z­ﬀﬁﬂﬃﬄﬅﬆ]+[.,;!?]?$' and (word collate "C")~'[­ﬀﬁﬂﬃﬄﬅﬆ]' and not coalesce((last collate "C")=any(cues),false) then
      token:=regexp_replace(word collate "C",'[.,;!?]$','');punct:=substring(word from char_length(token)+1);
      if (token collate "C")!~'(^|[^a-zﬀﬁﬂﬃﬄﬅﬆ])­|­($|[^a-zﬀﬁﬂﬃﬄﬅﬆ])' then
        token:=replace(replace(replace(replace(replace(replace(replace(token,'ﬀ','ff'),'ﬁ','fi'),'ﬂ','fl'),'ﬃ','ffi'),'ﬄ','ffl'),'ﬅ','st'),'ﬆ','st');
        word:=replace(token,'­','')||punct;
      end if;
    end if;
    result:=array_append(result,word);
  end loop;
  return array_to_string(result,' ');
end;
$ifp_7$;

create function private.ifp_terminal(p_text text,p_terminal text) returns text
language plpgsql stable set search_path='' as $ifp_8$
begin
  if (p_terminal collate "C")='as_rendered' then return p_text;end if;
  if (p_terminal collate "C") is distinct from 'append_period' or (p_text collate "C")~'[.]$' or (private.ifp_ascii_lower(p_text) collate "C")~'https?://|mailto:' then perform private.ifp_fail('invalid');end if;
  return p_text||'.';
end;
$ifp_8$;

create function private.ifp_ws_pattern() returns text
language plpgsql stable set search_path='' as $ifp_29$
begin
  return '['||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
    chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)||']';
end;
$ifp_29$;

create function private.ifp_role(p_text text) returns jsonb
language plpgsql stable set search_path='' as $ifp_9$
declare m text[];pattern text;answer jsonb;normalized text:=p_text;title text:='(?:(?:contract|freelance|senior|junior|lead|principal|staff|associate|graduate|intern) +)*(?:(?:backend|frontend|full[- ]stack|software|data|platform|cloud|devops|security|research|machine learning|AI|ML|product|QA) +)?(?:engineer|developer|analyst|architect|designer|scientist)';
begin
  title:=replace(title,' +',private.ifp_ws_pattern()||'+');
  pattern:='^('||title||')'||private.ifp_ws_pattern()||'+at'||private.ifp_ws_pattern()||'+([^;'||chr(10)||']+?)[.]?$';
  m:=regexp_match(normalized collate "C",pattern,'i');
  if m is null then return null;end if;
  answer:=jsonb_build_object('title',substring(p_text from regexp_instr(normalized collate "C",pattern,1,1,0,'i',1)
      for regexp_instr(normalized collate "C",pattern,1,1,1,'i',1)-regexp_instr(normalized collate "C",pattern,1,1,0,'i',1)),
    'employer',substring(p_text from regexp_instr(normalized collate "C",pattern,1,1,0,'i',2)
      for regexp_instr(normalized collate "C",pattern,1,1,1,'i',2)-regexp_instr(normalized collate "C",pattern,1,1,0,'i',2)));
  if strpos(answer->>'employer',chr(10))>0 then return null;end if;
  return answer;
end;
$ifp_9$;

create function private.ifp_metrics(p_text text) returns integer
language plpgsql stable set search_path='' as $ifp_10$
declare m text[];n integer:=0;pos integer:=1;at_pos integer;pattern text:='(?<![A-Za-z0-9])[+−-]?[0-9]+([.,][0-9]+)*( *(%|percent|milliseconds?|ms|seconds?|minutes?|hours?|users?|requests?|engineers?))?';before_value text;
begin
  loop
    at_pos:=regexp_instr(private.ifp_ws(p_text) collate "C",pattern,pos,1,0,'i');exit when at_pos=0;
    if at_pos>1 then
      before_value:=substring(private.ifp_ws(p_text) from at_pos-1 for 1);
      if ascii(before_value)>127 then perform private.ifp_fail('unicode');end if;
      if (before_value collate "C")~'[A-Za-z0-9]' then pos:=regexp_instr(private.ifp_ws(p_text) collate "C",pattern,pos,1,1,'i');continue;end if;
    end if;
    n:=n+1;pos:=regexp_instr(private.ifp_ws(p_text) collate "C",pattern,pos,1,1,'i');
    if n>256 then perform private.ifp_fail('resource');end if;
  end loop;return n;
end;
$ifp_10$;

create function private.ifp_lower_better(p_object text) returns boolean
language plpgsql stable set search_path='' as $ifp_11$
declare m text[];amount double precision;suffix text;raw_suffix text;pattern text:='^(API +)?(latency|response time) +by +([+]?[0-9]+([.][0-9]+)?) *(%|percent|milliseconds?|ms|seconds?)(.*)$';
begin
  pattern:=replace(replace(pattern,' +',private.ifp_ws_pattern()||'+'),' *',private.ifp_ws_pattern()||'*');
  m:=regexp_match(p_object collate "C",pattern,'i');
  if m is null then return false;end if;
  -- Frozen JS dot does not match line terminators in the post-unit suffix.
  raw_suffix:=substring(p_object from regexp_instr(p_object collate "C",pattern,1,1,0,'i',6)
    for regexp_instr(p_object collate "C",pattern,1,1,1,'i',6)-regexp_instr(p_object collate "C",pattern,1,1,0,'i',6));
  if (raw_suffix collate "C")~('['||chr(10)||chr(13)||chr(8232)||chr(8233)||']') then return false;end if;
  begin amount:=m[3]::double precision;exception when numeric_value_out_of_range then return false;end;
  if amount<=0 or amount='Infinity'::double precision then return false;end if;
  suffix:=regexp_replace(m[6] collate "C",'[.]$','');
  if (private.ifp_ws(suffix) collate "C")~'[^\x01-\x7f]' then perform private.ifp_fail('unicode');end if;
  return (suffix collate "C")!~*'(^|[^A-Za-z0-9_])(and|or|but|not|never|without)(?=$|[^A-Za-z0-9_])|[,;0-9]'
    and (btrim(private.ifp_ws(suffix),' ')='' or (suffix collate "C")~*('^'||private.ifp_ws_pattern()||'+(at|for|during|within|in)'||private.ifp_ws_pattern()||'+[A-Za-z]'));
end;
$ifp_11$;

create function private.ifp_clauses(p_text text) returns jsonb
language plpgsql stable set search_path='' as $ifp_12$
declare clauses jsonb:='[]';verbs text:='built|created|developed|designed|implemented|improved|reduced|increased|supported|helped|led|lead|managed|owned|maintained|worked';
 pattern text;cursor_pos integer:=1;begin_pos integer;end_pos integer;piece text;m text[];action text;object_value text;actor text;negated boolean;n integer;scope_count integer;
begin
  pattern:='; *| +and +(?=(?:(?:I|We) +)?(?:'||verbs||')(?=$|[^A-Za-z0-9_]))|[.] +(?=(?:(?:I|We) +)?(?:'||verbs||')(?=$|[^A-Za-z0-9_]))';
  loop
    begin_pos:=regexp_instr(private.ifp_ws(p_text) collate "C",pattern,cursor_pos,1,0,'i');
    end_pos:=case when begin_pos=0 then char_length(p_text)+1 else begin_pos end;
    piece:=substring(p_text from cursor_pos for end_pos-cursor_pos);
    -- Keep the raw clause and object for source-context equality. Whitespace/NFC
    -- normalization belongs to rendering, never the role/employer proof.
    piece:=substring(piece from char_length(piece)-char_length(ltrim(private.ifp_ws(piece),' '))+1
      for char_length(btrim(private.ifp_ws(piece),' ')));
    if (private.ifp_ws(piece) collate "C")~'^[•●·▪–—-] +(?=[A-Za-z])' then
      piece:=substring(piece from regexp_instr(private.ifp_ws(piece) collate "C",'^[•●·▪–—-] +(?=[A-Za-z])',1,1,1));
    end if;
    if piece<>'' then
      if jsonb_array_length(clauses)>=16 then perform private.ifp_fail('resource');end if;
      m:=regexp_match(private.ifp_ws(piece) collate "C",'^(?:(I|We) +)?(?:(did +not|never) +)?('||verbs||')(?=$|[^A-Za-z0-9_])','i');
      action:=case when m is null then null else m[3] end;
      actor:=case when m is null then 'unknown' when m[1] is null then 'implicit' else private.ifp_ascii_lower(m[1]) end;
      object_value:=null;
      -- regexp_match's full-match length is derived separately; never search for
      -- a second verb occurrence inside the object or a quoted identifier.
      if m is not null then
        object_value:=substring(piece from regexp_instr(private.ifp_ws(piece) collate "C",'^(?:(I|We) +)?(?:(did +not|never) +)?('||verbs||')(?=$|[^A-Za-z0-9_])',1,1,1,'i'));
        object_value:=substring(object_value from char_length(object_value)-char_length(ltrim(private.ifp_ws(object_value),' '))+1
          for char_length(btrim(private.ifp_ws(object_value),' ')));
      end if;
      negated:=(piece collate "C")~*'(^|[^A-Za-z0-9_])(not|never|without)(?=$|[^A-Za-z0-9_])';
      n:=case when object_value is null then 0 else private.ifp_metrics(object_value) end;
      select count(*) into scope_count from regexp_matches(private.ifp_ws(coalesce(object_value,'')) collate "C",'(?<![A-Za-z0-9_])(at|for|with|during|within|in) +','gi');
      if n>32 or scope_count>16 then perform private.ifp_fail('resource');end if;
      clauses:=clauses||jsonb_build_array(jsonb_build_object('text',piece,'surface',action,'actor',actor,'negated',negated,'object',nullif(object_value,''),'metrics',n,'scopes',scope_count));
    end if;
    exit when begin_pos=0;
    cursor_pos:=regexp_instr(private.ifp_ws(p_text) collate "C",pattern,cursor_pos,1,1,'i');
  end loop;return clauses;
end;
$ifp_12$;

create function private.ifp_inert(p_text text) returns boolean
language plpgsql stable set search_path='' as $ifp_13$
declare t text:=regexp_replace(p_text collate "C",'^Email: *','','i');host text;port text;
begin
  if (t collate "C")~'^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' then return true;end if;
  -- Conservative WHATWG-compatible inert URL subdomain. Other URL syntax is
  -- not guessed neutral; no generic URL/context claim is inferred from it.
  if (t collate "C")!~*'^https?://[A-Za-z][A-Za-z0-9-]*([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:[0-9]+)?(/[A-Za-z0-9._~/%?#=&+!-]*)?$' then return false;end if;
  port:=substring(t collate "C" from '^https?://[^/:]+:([0-9]+)');
  if port is not null and (char_length(port)>5 or port::integer>65535) then return false;end if;
  return true;
end;
$ifp_13$;

create function private.ifp_label(p_text text,p_kind text) returns boolean
language plpgsql stable set search_path='' as $ifp_14$
declare words text[];word text;tokens text;markers text[];
 rejected text[]:=array['built','created','developed','designed','implemented','improved','reduced','increased','supported','helped','led','lead','managed','owned','maintained','worked','no','not','never','without','thing','things','done','team','teams','result','results','hypothetical','fictional','fake','mock','planned','proposed','template','example','examples','sample','samples','other','candidate','candidates','colleague','colleagues','i','we','our','ours','my','mine','your','yours','you','he','his','she','her','hers','their','theirs','they','them','teamresults','othercandidates','hypotheticalexample','thingsneverdone'];
begin
  if char_length(p_text)>80 then return false;end if;
  tokens:=regexp_replace(p_text collate "C",'([a-z0-9])([A-Z])','\1 \2','g');
  foreach word in array regexp_split_to_array(private.ifp_ascii_lower(tokens) collate "C",'[^a-z0-9]+') loop if (word collate "C")=any(rejected) then return false;end if;end loop;
  words:=regexp_split_to_array(p_text collate "C",'[ '||chr(9)||']+');
  if array_length(words,1) not between 2 and 4 then return false;end if;
  foreach word in array words loop if char_length(word)>24 or (word collate "C")!~'^[A-Z][A-Za-z0-9]+$' then return false;end if;end loop;
  markers:=case when (p_kind collate "C")='project' then array['project','dashboard','worker','service','api','tool','platform','app','application','system','library','pipeline','portal','tracker','console']
    else array['labs','works','technologies','systems','software','solutions','inc','llc','ltd','limited','corporation','corp','company','co'] end;
  return private.ifp_ascii_lower(words[array_length(words,1)])=any(markers);
end;
$ifp_14$;

create function private.ifp_document(p_source text) returns jsonb
language plpgsql stable set search_path='' as $ifp_15$
declare chars text[];u16 integer[];units jsonb:='[]';anchors jsonb:='[]';lines jsonb;unit jsonb;next_unit jsonb;clause_value jsonb;ref jsonb;clauses jsonb;role_value jsonb;
  source_sha text;start_value integer;end_value integer;line_index integer:=0;line_count integer;tail text;t text;next_text text;gap text;first_cp integer;
  i integer;j integer;k integer;first_contribution integer;last_contribution integer;section_index integer:=-1;section_kind text;header_indices integer[];
  layout_metadata boolean[]:='{}';boundaries boolean[]:='{}';neutral_refs boolean[]:='{}';headers jsonb[]:='{}';qualifiers boolean:=false;right_qualified boolean;parsed boolean;heading boolean;initial_label boolean;reorderable boolean;actor text;previous_end integer:=0;
  metric_total integer;scope_total integer;work bigint;title_pattern text:='(?:(?:contract|freelance|senior|junior|lead|principal|staff|associate|graduate|intern) +)*(?:(?:backend|frontend|full[- ]stack|software|data|platform|cloud|devops|security|research|machine learning|AI|ML|product|QA) +)?(?:engineer|developer|analyst|architect|designer|scientist)';
begin
  if p_source is null or current_setting('server_encoding')<>'UTF8' then perform private.ifp_fail('unicode');end if;
  if char_length(p_source)>100000 or (p_source collate "C")~'[ſK]' then perform private.ifp_fail('unicode');end if;
  chars:=regexp_split_to_array(p_source collate "C",'');
  select array_prepend(0,coalesce(array_agg(n order by ord),'{}'::integer[])) into u16 from
    (select ord,(sum(case when ascii(c)>65535 then 2 else 1 end) over(order by ord))::integer n from unnest(chars) with ordinality v(c,ord)) counted;
  if u16[array_length(u16,1)]>100000 then perform private.ifp_fail('resource');end if;
  title_pattern:=replace(title_pattern,' +',private.ifp_ws_pattern()||'+');
  source_sha:=private.ifp_sha(p_source);metric_total:=private.ifp_metrics(p_source);
  select count(*) into scope_total from regexp_matches(private.ifp_ws(p_source) collate "C",'(?<![A-Za-z0-9_])(at|for|with|during|within|in) +','gi');
  if metric_total>256 or scope_total>256 then perform private.ifp_fail('resource');end if;
  select coalesce(jsonb_agg(jsonb_build_object('start',pos,'end',pos+char_length(line),'text',line) order by ord),'[]') into lines from
    (select line,ord,coalesce(sum(char_length(line)+1) over(order by ord rows between unbounded preceding and 1 preceding),0)::integer pos
      from string_to_table(p_source,chr(10)) with ordinality v(line,ord)) rows_value where btrim(private.ifp_ws(line),' ')<>'';
  line_count:=jsonb_array_length(lines);work:=char_length(p_source)*4;
  while line_index<line_count loop
    if jsonb_array_length(units)>=512 then perform private.ifp_fail('resource');end if;
    unit:=lines->line_index;start_value:=(unit->>'start')::integer;end_value:=(unit->>'end')::integer;tail:=unit->>'text';
    if private.ifp_clauses(tail)->0->>'surface' is not null then
      while (private.ifp_ws(tail) collate "C")!~'[.!?] *$' and line_index+1<line_count loop
        next_unit:=lines->(line_index+1);next_text:=btrim(private.ifp_ws(next_unit->>'text'),' ');gap:=substring(p_source from end_value+1 for (next_unit->>'start')::integer-end_value);
        exit when (gap collate "C") not in (chr(10),chr(13)||chr(10));
        first_cp:=ascii(substring(next_text from 1 for 1));
        if first_cp>127 and first_cp not in (8226,9679,183,9642,8211,8212) then perform private.ifp_fail('unicode');end if;
        exit when not ((next_text collate "C")~'^[a-z]' or ((private.ifp_ws(tail) collate "C")~'; *$' and private.ifp_clauses(next_text)->0->>'surface' is not null))
          or (next_text collate "C")~*'^(?:(professional|technical|relevant|work) +)?(summary|skills|experience|education|projects|certifications|achievements|awards|publications) *$'
          or (next_text collate "C")~'^[•●·▪–—-] ' or private.ifp_role(next_text) is not null;
        end_value:=(next_unit->>'end')::integer;tail:=next_unit->>'text';line_index:=line_index+1;
      end loop;
    end if;
    t:=substring(p_source from start_value+1 for end_value-start_value);
    start_value:=start_value+char_length(t)-char_length(ltrim(private.ifp_ws(t),' '));
    end_value:=end_value-(char_length(t)-char_length(rtrim(private.ifp_ws(t),' ')));
    t:=substring(p_source from start_value+1 for end_value-start_value);
    ref:=private.ifp_ref(p_source,u16,start_value,end_value);clauses:=private.ifp_clauses(t);role_value:=private.ifp_role(t);
    heading:=(private.ifp_ws(t) collate "C")~*'^(?:(professional|technical|relevant|work) +)?(summary|skills|experience|education|projects|certifications|achievements|awards|publications) *$';
    initial_label:=jsonb_array_length(units)=0 and (t collate "C")~'^[A-Z][a-z]{2,39}([ ''-][A-Z][a-z]{2,39}){1,3}$'
      and (t collate "C")!~*'(^|[^A-Za-z0-9_])(not|never|colleague|manager|team|other|their|example|hypothetical|fictional)(?=$|[^A-Za-z0-9_])'
      and not private.ifp_label(t,'project') and not private.ifp_label(t,'employer_role')
      and (t collate "C")!~*'(^|[^A-Za-z0-9_])(built|created|developed|designed|implemented|improved|reduced|increased|supported|helped|led|lead|managed|owned|maintained|worked|no|not|never|without|thing|things|done|team|teams|result|results|fake|mock|planned|proposed|template|example|examples|sample|samples|other|candidate|candidates|colleague|colleagues|i|we|our|ours|my|mine|your|yours|you|he|his|she|her|hers|their|theirs|they|them)(?=$|[^A-Za-z0-9_])';
    select coalesce(bool_and(value->>'surface' is not null),false) into parsed from jsonb_array_elements(clauses);
    units:=units||jsonb_build_array(jsonb_build_object('ref',ref,'id',private.ifp_sha(source_sha||':'||u16[start_value+1]::text||':'||u16[end_value+1]::text),
      'text',t,'start',start_value,'end',end_value,'clauses',clauses,'role',role_value,'heading',heading,'initial',initial_label,'parsed',parsed,'inert',private.ifp_inert(t)));
    line_index:=line_index+1;
  end loop;
  -- Reproduce finite project/employer metadata boundaries without assigning an
  -- employer/project fact. Unknown labels remain qualifiers, never proof.
  for i in 0..jsonb_array_length(units)-1 loop
    unit:=units->i;
    if (unit->>'heading')::boolean then section_index:=i;section_kind:=case (private.ifp_ascii_lower(unit->>'text') collate "C") when 'projects' then 'project' when 'experience' then 'employer_role' else null end;continue;end if;
    if section_kind is null or not private.ifp_label(unit->>'text',section_kind) then continue;end if;
    gap:=case when i>0 then substring(p_source from (units->(i-1)->>'end')::integer+1 for (unit->>'start')::integer-(units->(i-1)->>'end')::integer) else '' end;
    if not (i=section_index+1 and (gap collate "C") in (chr(10),chr(13)||chr(10))) and not (i>0 and (units->(i-1)->>'parsed')::boolean and (gap collate "C")~'^\r?\n([ \t]*\r?\n)+$') then continue;end if;
    header_indices:=array[i];first_contribution:=i+1;
    if section_kind='employer_role' then
      next_unit:=units->first_contribution;
      if next_unit is null or ((next_unit->>'text') collate "C")!~*('^'||title_pattern||'$') then continue;end if;
      gap:=substring(p_source from (unit->>'end')::integer+1 for (next_unit->>'start')::integer-(unit->>'end')::integer);
      if (gap collate "C") not in (chr(10),chr(13)||chr(10)) then continue;end if;
      header_indices:=array_append(header_indices,first_contribution);first_contribution:=first_contribution+1;
    end if;
    next_unit:=units->first_contribution;
    if next_unit is null or not (next_unit->>'parsed')::boolean then continue;end if;
    gap:=substring(p_source from (units->(first_contribution-1)->>'end')::integer+1 for (next_unit->>'start')::integer-(units->(first_contribution-1)->>'end')::integer);
    if (gap collate "C") not in (chr(10),chr(13)||chr(10)) then continue;end if;
    last_contribution:=first_contribution;
    while (units->(last_contribution+1)->>'parsed')::boolean is true loop last_contribution:=last_contribution+1;end loop;
    boundaries[i+1]:=true;if i=section_index+1 then boundaries[section_index+1]:=true;end if;
    foreach j in array header_indices loop layout_metadata[j+1]:=true;end loop;
    for j in first_contribution..last_contribution loop
      headers[j+1]:=jsonb_build_array(units->section_index->'ref');
      foreach k in array header_indices loop headers[j+1]:=headers[j+1]||jsonb_build_array(units->k->'ref');end loop;
      if section_kind='project' and ((units->(j+1)->>'text') collate "C")='API reference' then
        gap:=substring(p_source from (units->j->>'end')::integer+1 for (units->(j+1)->>'start')::integer-(units->j->>'end')::integer);
        if (gap collate "C") in (chr(10),chr(13)||chr(10)) then neutral_refs[j+2]:=true;end if;
      end if;
    end loop;
  end loop;
  for i in 0..jsonb_array_length(units)-1 loop
    unit:=units->i;work:=work+jsonb_array_length(units);
    if not (unit->>'heading')::boolean and unit->'role'='null'::jsonb and not (unit->>'parsed')::boolean
      and not (unit->>'initial')::boolean and not (unit->>'inert')::boolean and not coalesce(layout_metadata[i+1],false) then qualifiers:=true;end if;
    right_qualified:=false;
    if (unit->>'parsed')::boolean or unit->'role'<>'null'::jsonb then
      for j in i+1..jsonb_array_length(units)-1 loop
        next_unit:=units->j;
        exit when (next_unit->>'parsed')::boolean or next_unit->'role'<>'null'::jsonb or coalesce(boundaries[j+1],false);
        if not (next_unit->>'heading')::boolean and not (next_unit->>'initial')::boolean and not (next_unit->>'inert')::boolean and not coalesce(neutral_refs[j+1],false) then right_qualified:=true;end if;
      end loop;
    end if;
    actor:=unit->'clauses'->0->>'actor';reorderable:=true;
    for clause_value in select value from jsonb_array_elements(unit->'clauses') loop
      if clause_value->>'surface' is null or (clause_value->>'negated')::boolean or clause_value->>'actor'<>actor
        or ((clause_value->>'text') collate "C")~*'(^|[^A-Za-z0-9_])(then|before|after|because|thereby|following|their|its|this|that|these|those|it|they|them|former|latter|respectively)(?=$|[^A-Za-z0-9_])' then reorderable:=false;end if;
    end loop;
    anchors:=anchors||jsonb_build_array(unit||jsonb_build_object('unqualified',not qualifiers and not right_qualified and ((unit->>'parsed')::boolean or unit->'role'<>'null'::jsonb),
      'reorderable',reorderable,'headers',coalesce(headers[i+1],'[]'::jsonb),'adjacentRole',case when i>0 and anchors->(i-1)->'role'<>'null'::jsonb and (anchors->(i-1)->>'unqualified')::boolean and (substring(p_source from previous_end+1 for (unit->>'start')::integer-previous_end) collate "C") in (chr(10),chr(13)||chr(10)) then i-1 else null end));
    previous_end:=(unit->>'end')::integer;
  end loop;
  if work>8000000 then perform private.ifp_fail('resource');end if;
  return jsonb_build_object('source',p_source,'sourceSha256',source_sha,'u16',to_jsonb(u16),'anchors',anchors,'work',work);
end;
$ifp_15$;

create function private.ifp_span_text(p_doc jsonb,p_ref jsonb) returns text
language plpgsql stable set search_path='' as $ifp_16$
declare a integer;z integer;t text;
begin
  if private.ifp_keys(p_ref,array['start','end','textSha256']) is not true or jsonb_typeof(p_ref->'start') is distinct from 'number'
    or jsonb_typeof(p_ref->'end') is distinct from 'number' or ((p_ref->>'start') collate "C")!~'^(0|[1-9][0-9]{0,5})$' or ((p_ref->>'end') collate "C")!~'^[1-9][0-9]{0,5}$'
    or jsonb_typeof(p_ref->'textSha256') is distinct from 'string' or ((p_ref->>'textSha256') collate "C")!~'^[a-f0-9]{64}$' then perform private.ifp_fail('invalid');end if;
  a:=(p_ref->>'start')::integer;z:=(p_ref->>'end')::integer;
  if z<=a or z>char_length(p_doc->>'source') then perform private.ifp_fail('invalid');end if;
  t:=substring(p_doc->>'source' from a+1 for z-a);
  if private.ifp_sha(t) is distinct from p_ref->>'textSha256' then perform private.ifp_fail('invalid');end if;return t;
end;
$ifp_16$;

create function private.ifp_anchor(p_doc jsonb,p_ref jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_17$
declare answer jsonb;n integer;
begin
  perform private.ifp_span_text(p_doc,p_ref);
  select count(*),jsonb_agg(value)->0 into n,answer from jsonb_array_elements(p_doc->'anchors') where value->'ref'=p_ref;
  if n<>1 then perform private.ifp_fail('invalid');end if;return answer;
end;
$ifp_17$;

create function private.ifp_quote(p_doc jsonb,p_ref jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_18$
declare t text:=private.ifp_span_text(p_doc,p_ref);first_pos integer;refs jsonb;
begin
  if btrim(private.ifp_ws(t),' ')='' then perform private.ifp_fail('invalid');end if;
  first_pos:=strpos(p_doc->>'source',t);
  if first_pos<>(p_ref->>'start')::integer+1 or strpos(substring(p_doc->>'source' from first_pos+1),t)>0 then perform private.ifp_fail('invalid');end if;
  select coalesce(jsonb_agg(value->'ref' order by (value->>'start')::integer),'[]') into refs from jsonb_array_elements(p_doc->'anchors')
    where (value->>'start')::integer<(p_ref->>'end')::integer and (value->>'end')::integer>(p_ref->>'start')::integer;
  if jsonb_array_length(refs) not between 1 and 16 then perform private.ifp_fail('resource');end if;return refs;
end;
$ifp_18$;

create function private.ifp_original(p_doc jsonb,p_quote jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_19$
declare literal text:=private.ifp_basic(private.ifp_span_text(p_doc,p_quote));answer jsonb;n integer;
begin
  select count(*),jsonb_agg(value)->0 into n,answer from jsonb_array_elements(p_doc->'anchors') where (private.ifp_basic(value->>'text') collate "C")=literal;
  if n<>1 then perform private.ifp_fail('invalid');end if;return answer;
end;
$ifp_19$;

create function private.ifp_refs(p_anchor jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_20$
declare answer jsonb:='[]';item jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(p_anchor->'headers','[]')||jsonb_build_array(p_anchor->'ref')) loop
    if not answer@>jsonb_build_array(item) then answer:=answer||jsonb_build_array(item);end if;
  end loop;return answer;
end;
$ifp_20$;

create function private.ifp_variant(p_clause jsonb,p_choice text) returns text
language plpgsql stable set search_path='' as $ifp_21$
declare literal text:=private.ifp_basic(p_clause->>'text');surface text:=p_clause->>'surface';lower_surface text:=private.ifp_ascii_lower(surface);replacement text;prefix_value text;body text;m text[];
 verbs text:='built|created|developed|designed|implemented|improved|reduced|increased|supported|helped|led|lead|managed|owned|maintained|worked';
begin
  if (p_choice collate "C")='original' then return literal;end if;
  if (p_choice collate "C")='source_lower' then replacement:=lower_surface;
  elsif (p_choice collate "C")='source_title' then replacement:=translate(substring(surface from 1 for 1),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ')||substring(surface from 2);
  elsif (p_choice collate "C") in ('Built','built','Created','created','Developed','developed','Reduced','reduced') then replacement:=p_choice;
  else perform private.ifp_fail('invalid');end if;
  if surface is null then perform private.ifp_fail('invalid');end if;
  if (private.ifp_ascii_lower(replacement) collate "C")<>lower_surface and not (
    not (p_clause->>'negated')::boolean and (((lower_surface collate "C") in ('built','created','developed') and (private.ifp_ascii_lower(replacement) collate "C") in ('built','created','developed'))
      or ((lower_surface collate "C")='improved' and (private.ifp_ascii_lower(replacement) collate "C")='reduced' and private.ifp_lower_better(p_clause->>'object')))) then perform private.ifp_fail('invalid');end if;
  m:=regexp_match(literal collate "C",'^((?:(?:I|We) +)?(?:(?:did +not|never) +)?('||verbs||'))(?=$|[^A-Za-z0-9_])','i');
  if m is null then perform private.ifp_fail('invalid');end if;
  prefix_value:=substring(literal from 1 for char_length(m[1])-char_length(m[2]));body:=substring(literal from char_length(m[1])+1);
  return prefix_value||replacement||body;
end;
$ifp_21$;

create function private.ifp_role_display(p_title text) returns text
language plpgsql stable set search_path='' as $ifp_22$
declare t text:=p_title;word text;
begin
  foreach word in array array['Engineer','Developer','Analyst','Architect','Designer','Scientist'] loop
    t:=regexp_replace(t collate "C",'(?<![A-Za-z0-9_])'||word||'(?=$|[^A-Za-z0-9_])',private.ifp_ascii_lower(word),'g');
  end loop;return t;
end;
$ifp_22$;

create function private.ifp_editorial_forms(p_anchor jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_23$
declare forms jsonb:='["Clarifies wording.","Clarifies the wording.","Clarifies the contribution.","Clarifies the existing contribution.","Clarifies the technical contribution.","Emphasizes the existing technical contribution without adding claims.","Makes the source clearer.","Reorders the existing facts.","Preserves the source facts."]';
 object_value text;words text[];i integer;has_metrics boolean;
begin
  select coalesce(bool_or((value->>'metrics')::integer>0),false) into has_metrics from jsonb_array_elements(p_anchor->'clauses');
  if has_metrics then forms:=forms||'["Makes the measured outcome clearer.","Clarifies the measured contribution.","Clarifies the existing measured contribution.","Clarifies the existing contribution and measured result.","Clarifies the result."]'::jsonb;end if;
  object_value:=regexp_replace(regexp_replace(private.ifp_ws(p_anchor->'clauses'->0->>'object') collate "C",'^(a|an|the) +','','i'),'[.]$','');
  if object_value is not null and object_value<>'' then
    words:=regexp_split_to_array(private.ifp_ws(object_value) collate "C",' +');
    for i in 1..least(4,array_length(words,1)) loop
      exit when (words[i] collate "C")~*'(?<![A-Za-z0-9_])(at|for|with|during|within|in|by|and)(?=$|[^A-Za-z0-9_])|[0-9]';
      forms:=forms||jsonb_build_array('Clarifies '||array_to_string(words[1:i],' ')||' wording.');
    end loop;
  end if;return forms;
end;
$ifp_23$;

create function private.ifp_expr(p_doc jsonb,p_expr jsonb,p_place text,p_quote jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_24$
declare kind_value text:=p_expr->>'kind';text_value text;anchor jsonb;original jsonb;role_value jsonb;contribution jsonb;clause_value jsonb;piece jsonb;
 refs jsonb:='[]';part_kind text:='source_claim';part_state text:='supported';part_reason text:='source_transformation';n integer;i integer;ordinal integer:=0;used integer[]:='{}';parts text[]:='{}';forms jsonb;literal text;prefix_value text;topic text;form text;cost integer:=1;
 policy jsonb:=$ifp_policy${"version":"initial-feedback-plan-policy/1.0.0","authority":"source_content_only","ownedVersionProof":"not_provided","supportVersion":"qualitative-content-support/1.0.0","supportSha256":"230f22333dd468f3bf78395b118330ec1ff78de18be9da5349356e84d0f6bd13","writingSupportPolicyVersion":"legacy-source-transforms/1.0.4","reference":"exact_unicode_code_point_slice_and_utf8_sha256;whole_derived_anchor_for_anchorref","legacyAnchorIds":"unchanged_utf16_offsets_in_existing_source_hash_namespace","operators":["copy_source","normalize_layout","rewrite_clauses","role_summary","compose_explicit_role_contribution","editorial_fixed","editorial_measured","editorial_object_prefix","clarification_fixed","clarification_question"],"verbs":["original","source_lower","source_title","Built","built","Created","created","Developed","developed","Reduced","reduced"],"clauseJoin":"; ","normalization":"exact_frozen_comparable_or_guarded_comparableProse;no_generic_locale_fold","terminal":"as_rendered_or_append_one_period_only_without_url_or_mailto","templatePeriod":"strip_one_final_ascii_period_then_append_iff_selected","editorialTemplates":["Clarify this contribution","Clarify the wording","Review the wording","Improve readability","Clear","Clear evidence","Relevant","Relevant content","Detail","Add context","Clarifies wording","Clarifies the wording","Clarifies the contribution","Clarifies the existing contribution","Clarifies the technical contribution","Emphasizes the existing technical contribution without adding claims","Makes the source clearer","Reorders the existing facts","Preserves the source facts"],"measuredTemplates":["Makes the measured outcome clearer.","Clarifies the measured contribution.","Clarifies the existing measured contribution.","Clarifies the existing contribution and measured result.","Clarifies the result."],"clarificationTemplates":["Clarify your role","Explain the outcome","Add context you can verify","Add only a result you can verify","Add only a result you can verify. Leave this unanswered if the information is unavailable","Leave this unanswered if the information is unavailable"],"questionGrammar":{"topics":["outcome","result","context","scope","method","role","contribution"],"forms":["What <topic> can you verify?","What <topic> can you confirm?","Can you verify the <topic>?"],"presuppositions":"unsupported","unknownQuestionPunctuation":"withheld_before_ir_copy"},"admission":"actual_frozen_core;byte_exact_complete_retained_output;no_caller_assessments","mapping":"original_index_to_compacted_retained_and_explicit_min3_legacy_padding","nativeScope":"retained_output_only;full_node_observation_capture_only","limits":{"sourceUtf16":100000,"anchors":512,"clauses":16,"citationAnchors":16,"assessments":73,"expressions":41,"inputJsonBytes":65536,"plannerWorkUnits":8000000}}$ifp_policy$::jsonb;
begin
  if jsonb_typeof(p_expr) is distinct from 'object' or jsonb_typeof(p_expr->'kind') is distinct from 'string' then perform private.ifp_fail('invalid');end if;
  if (kind_value collate "C") in ('editorial_fixed','editorial_measured','editorial_object_prefix','clarification_fixed','clarification_question') then
    if (p_place collate "C") not in ('tip','reasoning') or (kind_value like 'clarification_%' and (p_place collate "C")<>'tip') then perform private.ifp_fail('invalid');end if;
    if p_quote is null then perform private.ifp_fail('invalid');end if;refs:=private.ifp_quote(p_doc,p_quote);
    if (kind_value collate "C") in ('editorial_fixed','clarification_fixed') then
      if private.ifp_keys(p_expr,array['kind','templateIndex','period']) is not true then perform private.ifp_fail('invalid');end if;
      forms:=case when (kind_value collate "C")='editorial_fixed' then policy->'editorialTemplates' else policy->'clarificationTemplates' end;
    elsif (kind_value collate "C")='editorial_measured' then
      if private.ifp_keys(p_expr,array['kind','anchor','templateIndex','period']) is not true then perform private.ifp_fail('invalid');end if;
      anchor:=private.ifp_anchor(p_doc,p_expr->'anchor');original:=private.ifp_original(p_doc,p_quote);
      if anchor->'ref'<>original->'ref' or not exists(select 1 from jsonb_array_elements(anchor->'clauses') x where (x->>'metrics')::integer>0) then perform private.ifp_fail('invalid');end if;
      refs:=private.ifp_refs(anchor);forms:=policy->'measuredTemplates';
    elsif (kind_value collate "C")='editorial_object_prefix' then
      if private.ifp_keys(p_expr,array['kind','anchor','wordCount','period']) is not true or jsonb_typeof(p_expr->'wordCount') is distinct from 'number' or ((p_expr->>'wordCount') collate "C")!~'^[1-4]$' then perform private.ifp_fail('invalid');end if;
      anchor:=private.ifp_anchor(p_doc,p_expr->'anchor');original:=private.ifp_original(p_doc,p_quote);
      if anchor->'ref'<>original->'ref' then perform private.ifp_fail('invalid');end if;refs:=private.ifp_refs(anchor);
      literal:=regexp_replace(regexp_replace(private.ifp_ws(anchor->'clauses'->0->>'object') collate "C",'^(a|an|the) +','','i'),'[.]$','');parts:=regexp_split_to_array(private.ifp_ws(literal) collate "C",' +');n:=(p_expr->>'wordCount')::integer;
      if array_length(parts,1)<n then perform private.ifp_fail('invalid');end if;text_value:='Clarifies '||array_to_string(parts[1:n],' ')||' wording.';
    else
      if private.ifp_keys(p_expr,array['kind','topic','form']) is not true or jsonb_typeof(p_expr->'topic') is distinct from 'string' or jsonb_typeof(p_expr->'form') is distinct from 'string' then perform private.ifp_fail('invalid');end if;
      topic:=p_expr->>'topic';form:=p_expr->>'form';
      if not ((policy->'questionGrammar'->'topics')?topic) or (form collate "C") not in ('what_verify','what_confirm','can_verify') then perform private.ifp_fail('invalid');end if;
      text_value:=case (form collate "C") when 'what_verify' then 'What '||topic||' can you verify?' when 'what_confirm' then 'What '||topic||' can you confirm?' else 'Can you verify the '||topic||'?' end;
    end if;
    if (kind_value collate "C")<>'clarification_question' then
      if jsonb_typeof(p_expr->'period') is distinct from 'boolean' then perform private.ifp_fail('invalid');end if;
      if (kind_value collate "C")<>'editorial_object_prefix' then
        if jsonb_typeof(p_expr->'templateIndex') is distinct from 'number' or ((p_expr->>'templateIndex') collate "C")!~'^(0|[1-9][0-9]?)$' then perform private.ifp_fail('invalid');end if;
        n:=(p_expr->>'templateIndex')::integer;if n>=jsonb_array_length(forms) then perform private.ifp_fail('invalid');end if;text_value:=forms->>n;
      end if;
      text_value:=regexp_replace(text_value collate "C",'[.]$','')||case when (p_expr->>'period')::boolean then '.' else '' end;
    end if;
    if (kind_value collate "C") in ('editorial_measured','editorial_object_prefix') or (p_place collate "C")='reasoning' then
      if anchor is null then anchor:=private.ifp_original(p_doc,p_quote);end if;forms:=private.ifp_editorial_forms(anchor);
      if not exists(select 1 from jsonb_array_elements_text(forms) x where (private.ifp_basic(x) collate "C")=private.ifp_basic(text_value)) then perform private.ifp_fail('invalid');end if;refs:=private.ifp_refs(anchor);
    end if;
    if (p_place collate "C")='tip' and kind_value not like 'clarification_%' and (text_value collate "C")~'[?？؟]' then perform private.ifp_fail('invalid');end if;
    if kind_value like 'clarification_%' then part_kind:='clarification_question';part_state:='clarification_required';part_reason:='clarification_template';cost:=0;
    else part_kind:='editorial_observation';part_reason:='editorial_template';cost:=case when (kind_value collate "C")='editorial_fixed' and (p_place collate "C")='tip' then 0 else 1 end;end if;
  else
    if (p_place collate "C")='reasoning' then perform private.ifp_fail('invalid');end if;
    if (kind_value collate "C") in ('copy_source','normalize_layout','rewrite_clauses') then
      if (kind_value collate "C")='copy_source' then
        if private.ifp_keys(p_expr,array['kind','anchor']) is not true then perform private.ifp_fail('invalid');end if;
      elsif (kind_value collate "C")='normalize_layout' then
        if private.ifp_keys(p_expr,array['kind','anchor','typography','terminal']) is not true then perform private.ifp_fail('invalid');end if;
      else
        if private.ifp_keys(p_expr,array['kind','anchor','clauses','typography','terminal']) is not true or jsonb_typeof(p_expr->'clauses') is distinct from 'array' then perform private.ifp_fail('invalid');end if;
      end if;
      anchor:=private.ifp_anchor(p_doc,p_expr->'anchor');
      if not (anchor->>'unqualified')::boolean then perform private.ifp_fail('invalid');end if;
      if (p_place collate "C")<>'summary' then original:=private.ifp_original(p_doc,p_quote);if original->'ref'<>anchor->'ref' then perform private.ifp_fail('invalid');end if;end if;
      refs:=private.ifp_refs(anchor);
      if (kind_value collate "C")='copy_source' then text_value:=anchor->>'text';
      elsif (kind_value collate "C")='normalize_layout' then text_value:=private.ifp_normalize(anchor->>'text',p_expr->>'typography');
      else
        n:=jsonb_array_length(anchor->'clauses');if n not between 1 and 16 or jsonb_array_length(p_expr->'clauses')<>n then perform private.ifp_fail('invalid');end if;
        parts:='{}';ordinal:=0;
        for piece in select value from jsonb_array_elements(p_expr->'clauses') loop
          if private.ifp_keys(piece,array['sourceIndex','verb']) is not true or jsonb_typeof(piece->'sourceIndex') is distinct from 'number' or ((piece->>'sourceIndex') collate "C")!~'^(0|[1-9][0-9]?)$'
            or jsonb_typeof(piece->'verb') is distinct from 'string' then perform private.ifp_fail('invalid');end if;
          i:=(piece->>'sourceIndex')::integer;if i>=n or i=any(used) or (i<>ordinal and not (anchor->>'reorderable')::boolean) then perform private.ifp_fail('invalid');end if;
          used:=array_append(used,i);clause_value:=anchor->'clauses'->i;parts:=array_append(parts,private.ifp_normalize(private.ifp_variant(clause_value,piece->>'verb'),p_expr->>'typography'));ordinal:=ordinal+1;
        end loop;
        text_value:=array_to_string(parts,'; ');
      end if;
      if (kind_value collate "C")<>'copy_source' then
        if jsonb_typeof(p_expr->'typography') is distinct from 'string' or jsonb_typeof(p_expr->'terminal') is distinct from 'string' then perform private.ifp_fail('invalid');end if;
        text_value:=private.ifp_terminal(text_value,p_expr->>'terminal');
      end if;
    elsif (kind_value collate "C") in ('role_summary','compose_explicit_role_contribution') then
      if (p_place collate "C")<>'summary' then perform private.ifp_fail('invalid');end if;
      if (kind_value collate "C")='role_summary' then
        if private.ifp_keys(p_expr,array['kind','role','terminal']) is not true then perform private.ifp_fail('invalid');end if;
      else
        if private.ifp_keys(p_expr,array['kind','role','contribution','verb','terminal']) is not true or jsonb_typeof(p_expr->'verb') is distinct from 'string' then perform private.ifp_fail('invalid');end if;
      end if;
      role_value:=private.ifp_anchor(p_doc,p_expr->'role');if role_value->'role'='null'::jsonb or not (role_value->>'unqualified')::boolean then perform private.ifp_fail('invalid');end if;
      refs:=private.ifp_refs(role_value);text_value:=private.ifp_role_display(role_value->'role'->>'title')||' at '||(role_value->'role'->>'employer');
      if (kind_value collate "C")='compose_explicit_role_contribution' then
        select count(*) into n from jsonb_array_elements(p_doc->'anchors') x where (x->'role'->>'employer') collate "C"=(role_value->'role'->>'employer') collate "C";
        contribution:=private.ifp_anchor(p_doc,p_expr->'contribution');clause_value:=contribution->'clauses'->0;
        if n<>1 or not (contribution->>'unqualified')::boolean or jsonb_array_length(contribution->'clauses')<>1
          or contribution->>'adjacentRole' is null or p_doc->'anchors'->((contribution->>'adjacentRole')::integer)->'ref'<>role_value->'ref'
          or clause_value->>'actor'<>'implicit' or clause_value->>'surface' is null or clause_value->>'object' is null or (clause_value->>'negated')::boolean then perform private.ifp_fail('invalid');end if;
        literal:=substring(clause_value->>'object' from regexp_instr(private.ifp_ws(clause_value->>'object') collate "C",' +at +([^;]+?)[.]?$',1,1,0,'i',1)
          for regexp_instr(private.ifp_ws(clause_value->>'object') collate "C",' +at +([^;]+?)[.]?$',1,1,1,'i',1)-regexp_instr(private.ifp_ws(clause_value->>'object') collate "C",' +at +([^;]+?)[.]?$',1,1,0,'i',1));
        if literal collate "C" is distinct from (role_value->'role'->>'employer') collate "C" then perform private.ifp_fail('invalid');end if;
        literal:=private.ifp_variant(clause_value,p_expr->>'verb');
        text_value:=private.ifp_role_display(role_value->'role'->>'title')||' who '||private.ifp_ascii_lower(substring(literal from 1 for 1))||substring(literal from 2);
        for piece in select value from jsonb_array_elements(private.ifp_refs(contribution)) loop if not refs@>jsonb_build_array(piece) then refs:=refs||jsonb_build_array(piece);end if;end loop;
      end if;
      text_value:=private.ifp_terminal(private.ifp_basic(text_value),p_expr->>'terminal');
    else perform private.ifp_fail('invalid');end if;
    if (text_value collate "C")~'[?？؟]' then perform private.ifp_fail('invalid');end if;cost:=case when (p_place collate "C")='tip' then 2 else 1 end;
  end if;
  if text_value is null or btrim(private.ifp_ws(text_value),' ')='' or char_length(text_value)>2000 or jsonb_array_length(refs)>16 then perform private.ifp_fail('resource');end if;
  return jsonb_build_object('text',text_value,'part',jsonb_build_object('kind',part_kind,'state',part_state,'reason',part_reason,'textSha256',private.ifp_sha(text_value),'sourceRefs',refs),
    'assessments',cost,'work',char_length(p_doc->>'source')*8+char_length(text_value)*4);
end;
$ifp_24$;

create function private.ifp_u16_length(p_text text) returns integer
language plpgsql stable set search_path='' as $ifp_25$
begin return (select coalesce(sum(case when c='' then 0 when ascii(c)>65535 then 2 else 1 end),0)::integer from unnest(regexp_split_to_array(p_text collate "C",'')) c);end;
$ifp_25$;

create function private.render_initial_feedback_plan(p_source text,p_plan jsonb) returns jsonb
language plpgsql stable set search_path='' as $ifp_26$
declare doc jsonb;prose jsonb:='{"toneAndStyle":{"tips":[]},"content":{"tips":[]},"structure":{"tips":[]},"skills":{"tips":[]},"writer":{"summary":null,"bullets":[]}}';
 parts_tips jsonb:='[]';parts_bullets jsonb:='[]';summary_part jsonb:='null';map_tips jsonb:='[]';map_bullets jsonb:='[]';padding jsonb:='[]';summary_map jsonb:='null';compatibility jsonb:='{}';
 category text;item jsonb;quote_value text;title_value jsonb;explanation_value jsonb;rewrite_value jsonb;reasoning_value jsonb;summary_value jsonb;tip jsonb;category_tips jsonb;writer_bullets jsonb:='[]';
 type_value text;kind_value text;state_value text;reason_value text;last_index integer;original_index integer;retained_index integer;expression_count integer:=0;assessment_count integer:=0;retained_count integer:=0;work bigint;
begin
  if p_source is null or p_plan is null or private.ifp_keys(p_plan,array['schemaVersion','sourceTextSha256','policyVersion','toneAndStyle','content','structure','skills','writer']) is not true
    or ((p_plan->>'schemaVersion') collate "C") is distinct from 'initial-feedback-plan/1.0.0' or ((p_plan->>'policyVersion') collate "C") is distinct from 'initial-feedback-plan-policy/1.0.0'
    or jsonb_typeof(p_plan->'sourceTextSha256') is distinct from 'string' or ((p_plan->>'sourceTextSha256') collate "C") is distinct from private.ifp_sha(p_source)
    or octet_length(convert_to(p_plan::text,'UTF8'))>65536 then perform private.ifp_fail('invalid');end if;
  doc:=private.ifp_document(p_source);work:=(doc->>'work')::bigint;
  foreach category in array array['toneAndStyle','content','structure','skills'] loop
    if jsonb_typeof(p_plan->category) is distinct from 'array' or jsonb_array_length(p_plan->category)>4 then perform private.ifp_fail('invalid');end if;
    last_index:=-1;retained_index:=0;category_tips:='[]';
    for item in select value from jsonb_array_elements(p_plan->category) loop
      if private.ifp_keys(item,array['originalIndex','requestedType','quote','title','explanation']) is not true or jsonb_typeof(item->'originalIndex') is distinct from 'number'
        or ((item->>'originalIndex') collate "C")!~'^[0-3]$' or jsonb_typeof(item->'requestedType') is distinct from 'string' or item->>'requestedType' not in ('good','improve') then perform private.ifp_fail('invalid');end if;
      original_index:=(item->>'originalIndex')::integer;if original_index<=last_index then perform private.ifp_fail('invalid');end if;last_index:=original_index;
      quote_value:=private.ifp_span_text(doc,item->'quote');perform private.ifp_quote(doc,item->'quote');work:=work+char_length(p_source)*4;
      title_value:=private.ifp_expr(doc,item->'title','tip',item->'quote');explanation_value:=private.ifp_expr(doc,item->'explanation','tip',item->'quote');
      if private.ifp_u16_length(quote_value)>500 or private.ifp_u16_length(title_value->>'text')>500 or private.ifp_u16_length(explanation_value->>'text')>1000 then perform private.ifp_fail('resource');end if;
      kind_value:=case when title_value->'part'->>'kind'='clarification_question' or explanation_value->'part'->>'kind'='clarification_question' then 'clarification_question'
        when title_value->'part'->>'kind'='source_claim' or explanation_value->'part'->>'kind'='source_claim' then 'source_claim' else 'editorial_observation' end;
      state_value:=case when (kind_value collate "C")='clarification_question' then 'clarification_required' else 'supported' end;
      reason_value:=case (kind_value collate "C") when 'clarification_question' then 'question_only' when 'source_claim' then 'source_transformation' else 'editorial_template' end;
      type_value:=case when (kind_value collate "C")='source_claim' then item->>'requestedType' else 'improve' end;
      tip:=jsonb_build_object('type',type_value,'tip',title_value->>'text','explanation',explanation_value->>'text','quote',quote_value);
      category_tips:=category_tips||jsonb_build_array(tip);
      parts_tips:=parts_tips||jsonb_build_array(jsonb_build_object('category',category,'originalIndex',original_index,'retainedIndex',retained_index,'type',type_value,
        'kind',kind_value,'state',state_value,'reason',reason_value,'quote',item->'quote','title',title_value->'part','explanation',explanation_value->'part'));
      map_tips:=map_tips||jsonb_build_array(jsonb_build_object('category',category,'originalIndex',original_index,'retainedIndex',retained_index,'compatibilityIndex',retained_index));
      expression_count:=expression_count+2;assessment_count:=assessment_count+(title_value->>'assessments')::integer+(explanation_value->>'assessments')::integer;
      work:=work+(title_value->>'work')::bigint+(explanation_value->>'work')::bigint;
      if work>8000000 or assessment_count>73 or expression_count>41 then perform private.ifp_fail('resource');end if;
      retained_count:=retained_count+1;retained_index:=retained_index+1;
    end loop;
    prose:=jsonb_set(prose,array[category,'tips'],category_tips);
    while jsonb_array_length(category_tips)<3 loop
      padding:=padding||jsonb_build_array(jsonb_build_object('category',category,'compatibilityIndex',jsonb_array_length(category_tips),'origin',null,'scope','compatibility_only'));
      category_tips:=category_tips||jsonb_build_array(jsonb_build_object('type','improve','tip','No additional cited suggestion is available.','explanation','Review the source evidence before adding information.'));
    end loop;
    compatibility:=compatibility||jsonb_build_object(category,jsonb_build_object('score',0,'tips',category_tips));
  end loop;
  if private.ifp_keys(p_plan->'writer',array['summary','bullets']) is not true or jsonb_typeof(p_plan->'writer'->'bullets') is distinct from 'array'
    or jsonb_array_length(p_plan->'writer'->'bullets')>4 then perform private.ifp_fail('invalid');end if;
  if p_plan->'writer'->'summary'<>'null'::jsonb then
    summary_value:=private.ifp_expr(doc,p_plan->'writer'->'summary','summary',null);
    if private.ifp_u16_length(summary_value->>'text')>1200 then perform private.ifp_fail('resource');end if;
    prose:=jsonb_set(prose,array['writer','summary'],summary_value->'text');summary_part:=summary_value->'part';summary_map:=jsonb_build_object('retainedIndex',0);
    expression_count:=expression_count+1;assessment_count:=assessment_count+(summary_value->>'assessments')::integer;work:=work+(summary_value->>'work')::bigint;retained_count:=retained_count+1;
  end if;
  last_index:=-1;retained_index:=0;
  for item in select value from jsonb_array_elements(p_plan->'writer'->'bullets') loop
    if private.ifp_keys(item,array['originalIndex','original','rewrite','reasoning']) is not true or jsonb_typeof(item->'originalIndex') is distinct from 'number'
      or ((item->>'originalIndex') collate "C")!~'^[0-3]$' then perform private.ifp_fail('invalid');end if;
    original_index:=(item->>'originalIndex')::integer;if original_index<=last_index then perform private.ifp_fail('invalid');end if;last_index:=original_index;
    quote_value:=private.ifp_span_text(doc,item->'original');perform private.ifp_quote(doc,item->'original');work:=work+char_length(p_source)*4;
    rewrite_value:=private.ifp_expr(doc,item->'rewrite','rewrite',item->'original');reasoning_value:=private.ifp_expr(doc,item->'reasoning','reasoning',item->'original');
    if private.ifp_u16_length(quote_value)>500 or private.ifp_u16_length(rewrite_value->>'text')>700 or private.ifp_u16_length(reasoning_value->>'text')>500 then perform private.ifp_fail('resource');end if;
    writer_bullets:=writer_bullets||jsonb_build_array(jsonb_build_object('original',quote_value,'rewrite',rewrite_value->>'text','reasoning',reasoning_value->>'text'));
    parts_bullets:=parts_bullets||jsonb_build_array(jsonb_build_object('originalIndex',original_index,'retainedIndex',retained_index,'original',item->'original','rewrite',rewrite_value->'part','reasoning',reasoning_value->'part'));
    map_bullets:=map_bullets||jsonb_build_array(jsonb_build_object('originalIndex',original_index,'retainedIndex',retained_index));
    expression_count:=expression_count+2;assessment_count:=assessment_count+(rewrite_value->>'assessments')::integer+(reasoning_value->>'assessments')::integer;
    work:=work+(rewrite_value->>'work')::bigint+(reasoning_value->>'work')::bigint;retained_count:=retained_count+1;retained_index:=retained_index+1;
    if work>8000000 or assessment_count>73 or expression_count>41 then perform private.ifp_fail('resource');end if;
  end loop;
  prose:=jsonb_set(prose,array['writer','bullets'],writer_bullets);compatibility:=compatibility||jsonb_build_object('writer',prose->'writer');
  if retained_count=0 or work>8000000 or assessment_count>73 or expression_count>41 or octet_length(convert_to(prose::text,'UTF8'))>65536 then perform private.ifp_fail('resource');end if;
  return jsonb_build_object('schemaVersion','initial-feedback-render/1.0.0','authority','source_content_only','ownedVersionProof','not_provided',
    'policyVersion','initial-feedback-plan-policy/1.0.0','policySha256','972b648ccc90b29c0c88fc504ac2746ab1489e17f05cfd2048cb487a2b38cc48','sourceTextSha256',doc->>'sourceSha256','prose',prose,
    'parts',jsonb_build_object('tips',parts_tips,'writer',jsonb_build_object('summary',summary_part,'bullets',parts_bullets)),
    'mapping',jsonb_build_object('tips',map_tips,'bullets',map_bullets,'summary',summary_map,'padding',padding),'compatibility',compatibility);
end;
$ifp_26$;

create function public.read_initial_feedback_plan_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $ifp_27$
begin
  return jsonb_build_object('schemaVersion','initial-feedback-plan-readiness/1.0.0','profileVersion','initial-feedback-plan-profile/1.0.0',
    'policyVersion','initial-feedback-plan-policy/1.0.0','policySha256','972b648ccc90b29c0c88fc504ac2746ab1489e17f05cfd2048cb487a2b38cc48','schemaReady',private.initial_feedback_plan_ready(),
    'checkerSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_plan_ready()')),
    'rendererSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('private.render_initial_feedback_plan(text,jsonb)')),
    'metadataSha256',(select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback_plan_readiness()')));
end;
$ifp_27$;

create function private.initial_feedback_plan_ready() returns boolean
language plpgsql stable set search_path='' as $ifp_28$
declare base pg_catalog.pg_proc%rowtype;p pg_catalog.pg_proc%rowtype;item jsonb;role_name text;
 service_oid oid:=(select oid from pg_catalog.pg_roles where rolname='service_role');manifest jsonb:=$ifp_catalog$[
  {
    "signature": "private.ifp_fail(text)",
    "sha256": "a9a5bc12653ba6b53158ae97dbc7526c5f3604d24be071eda9fbfe0149bf73f5",
    "resultType": "void",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_keys(jsonb,text[])",
    "sha256": "c4b190e767d1f59b67851d1c6b0d923e22fb5c7a1867dcea882688809bb00977",
    "resultType": "boolean",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_sha(text)",
    "sha256": "6440459df73106c61fde67ad022c5564f42d77c2a04a0d6b18005b42238bc281",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_ascii_lower(text)",
    "sha256": "143003790d44521c089ac1c813b17543f437316f2565e47f4e91e23d923d14d0",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_ws(text)",
    "sha256": "a078623b5874ae4fc6c90a2aeac19562262d770ce76a7dbe3a7cc37d533560d0",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_ref(text,integer[],integer,integer)",
    "sha256": "f71cf7092f1f31ec76e070ce8993fa220c66413a4049050edbabfd824c886956",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_basic(text)",
    "sha256": "9ddcaf5bfdd42076c25796795beb5d0fba4710aee9d5787d38cddcba38a3ba3c",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_normalize(text,text)",
    "sha256": "f24e35c6daa99a227ba3acb11fcdab3f518f2e98b0ea087a2afbd147bbe131f1",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_terminal(text,text)",
    "sha256": "2609a914de79bab02630736e43975988428d51f5c0a608d4e16b7c9f0cf7fec4",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_role(text)",
    "sha256": "6b35f94bce599241ef9d1943ee4a8547f4c8cc9af65e8ccc62bb011181c1bf28",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_metrics(text)",
    "sha256": "37b68858699af99ebebb5afd20a41d850b5b979fc9e1797ecf04e5e65e4dc9c7",
    "resultType": "integer",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_lower_better(text)",
    "sha256": "e626929d6554edfea62a69db25eb3420ba731a0f582435f72c22533dc986f04d",
    "resultType": "boolean",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_clauses(text)",
    "sha256": "37d58de3ab8e843d1486251e54f92be021c20e28b76747a6818a42d6052e5a23",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_inert(text)",
    "sha256": "e737f3b8988404da6d8e26794fe9cddf7cdd6806ac98aa7aeaec981372ce315a",
    "resultType": "boolean",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_label(text,text)",
    "sha256": "4e546361a790623d0a5d920755511584c32466f9ee38513728fee7f7dcba735b",
    "resultType": "boolean",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_document(text)",
    "sha256": "8989dc6da24c12c99d1f921e1e9d24f6ec446a50cba52963b87fd8854dee0d19",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_span_text(jsonb,jsonb)",
    "sha256": "44c9af467f2ea4014fff219808619c445974b880e6e836b025b96323334a534a",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_anchor(jsonb,jsonb)",
    "sha256": "87535288df83624cf7c583ed5ebf04ccb7ddafd5db71ae6ece392d99b8b09719",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_quote(jsonb,jsonb)",
    "sha256": "fe589cd72c2fa2a93e925d76cded433e9233b0b5830744aff49eb7cebcc955be",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_original(jsonb,jsonb)",
    "sha256": "0f55e488f917b1e42ebe278da848a0f192db9d8fc01f28318f0e4c17a57d6c3a",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_refs(jsonb)",
    "sha256": "554bb5d03c733cc4eecbb4ed148d35484cfd7aca2da9073efc7230569b06b514",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_variant(jsonb,text)",
    "sha256": "f3d19c72f387cd24c48b885bafff0f7cc4a3c3a8826c8fe6c08f26fa48ec223b",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_role_display(text)",
    "sha256": "7210bbacf7ba9a6beb71577d515ea6c3159b8ca6854c54c4fae507345d0fd3e2",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_editorial_forms(jsonb)",
    "sha256": "b3e6550a021ec1137b68da1f6d9aa2fe6770945c183409ca6bfbc5546badceb0",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_expr(jsonb,jsonb,text,jsonb)",
    "sha256": "64ec3a5d95cf26bb0a9dc5164a888fce1194545a9d1e9d227166fec6d1a94220",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.ifp_u16_length(text)",
    "sha256": "d7d28a2022991977c4c7b68249fdd090745aa7f4c0450d7b12273f0e56deb087",
    "resultType": "integer",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "private.render_initial_feedback_plan(text,jsonb)",
    "sha256": "c8bc131aacc7f9ddd8e30dcca8f5f429e78ee84180e5dd4542254883001cedc6",
    "resultType": "jsonb",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  },
  {
    "signature": "public.read_initial_feedback_plan_readiness()",
    "sha256": "3c133694d11334e9430821945c94782b562ab1efb3f26bb8d4e7a9f2699369c5",
    "resultType": "jsonb",
    "definer": true,
    "volatility": "s",
    "acl": "metadata"
  },
  {
    "signature": "private.ifp_ws_pattern()",
    "sha256": "06f26887ed31d80a210f5496e315385fc3ba80910536f64f5c7277dd2ce8725f",
    "resultType": "text",
    "definer": false,
    "volatility": "s",
    "acl": "private"
  }
]$ifp_catalog$::jsonb;
begin
  if current_setting('server_encoding')<>'UTF8' or current_setting('server_version_num')::integer<150000 then return false;end if;
  select * into base from pg_catalog.pg_proc where oid=to_regprocedure('private.render_initial_feedback_plan(text,jsonb)');if not found then return false;end if;
  for item in select value from jsonb_array_elements(manifest) loop
    select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.proowner<>base.proowner or p.prorettype<>to_regtype(item->>'resultType')
      or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql') or p.prosecdef is distinct from (item->>'definer')::boolean
      or p.provolatile<>item->>'volatility' or p.proconfig is distinct from array['search_path=""']
      or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>item->>'sha256' then return false;end if;
    if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner
      and (item->>'acl'='private' or a.grantee<>service_oid or a.privilege_type<>'EXECUTE' or a.is_grantable)) then return false;end if;
    foreach role_name in array array['anon','authenticated'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
    if item->>'acl'='private' and has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;
    if item->>'acl'='metadata' and (not has_function_privilege('service_role',p.oid,'EXECUTE') or not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=service_oid and a.privilege_type='EXECUTE' and not a.is_grantable)) then return false;end if;
  end loop;
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure('private.initial_feedback_plan_ready()');
  if not found or p.prokind<>'f' or p.proretset or p.proisstrict or p.prorettype<>'boolean'::regtype or p.proowner<>base.proowner
    or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql') or p.prosecdef or p.provolatile<>'s'
    or p.proconfig is distinct from array['search_path=""'] or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee<>p.proowner) then return false;end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if has_function_privilege(role_name,p.oid,'EXECUTE') then return false;end if;end loop;
  return true;
exception when others then return false;
end;
$ifp_28$;

revoke all on function private.ifp_fail(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_keys(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function private.ifp_sha(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_ascii_lower(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_ws(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_ref(text,integer[],integer,integer) from public,anon,authenticated,service_role;
revoke all on function private.ifp_basic(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_normalize(text,text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_terminal(text,text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_role(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_metrics(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_lower_better(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_clauses(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_inert(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_label(text,text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_document(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_span_text(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_anchor(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_quote(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_original(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_refs(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_variant(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_role_display(text) from public,anon,authenticated,service_role;
revoke all on function private.ifp_editorial_forms(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_expr(jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ifp_u16_length(text) from public,anon,authenticated,service_role;
revoke all on function private.render_initial_feedback_plan(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_initial_feedback_plan_readiness() from public,anon,authenticated,service_role;
revoke all on function private.ifp_ws_pattern() from public,anon,authenticated,service_role;
revoke all on function private.initial_feedback_plan_ready() from public,anon,authenticated,service_role;
grant execute on function public.read_initial_feedback_plan_readiness() to service_role;
commit;
