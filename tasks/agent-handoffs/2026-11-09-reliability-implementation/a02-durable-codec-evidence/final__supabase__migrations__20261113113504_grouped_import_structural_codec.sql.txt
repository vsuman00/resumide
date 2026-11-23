begin;

-- Framing only: no command normalization, ownership, replay or write admission.
-- PostgreSQL UTF8 text cannot contain NUL or unpaired surrogates; JS rejects both.
create function private.grouped_import_command_bytes(p_atoms text[])
returns bytea language plpgsql immutable security invoker set search_path = '' as $$
declare result bytea := convert_to(E'A02OP1\n','UTF8'); atom text; token bytea; data bytea;
begin
  if p_atoms is null
    or (cardinality(p_atoms)>0 and (array_ndims(p_atoms)<>1 or array_lower(p_atoms,1)<>1)) then
    raise exception 'GROUPED_IMPORT_CODEC_ATOMS' using errcode='22023';
  end if;
  if cardinality(p_atoms)>2048 then raise exception 'GROUPED_IMPORT_CODEC_LIMIT' using errcode='22023'; end if;
  foreach atom in array p_atoms loop
    if atom is null then token:=convert_to('N;','UTF8');
    else
      if octet_length(atom)>131072 then raise exception 'GROUPED_IMPORT_CODEC_LIMIT' using errcode='22023'; end if;
      data:=convert_to(atom,'UTF8');
      if octet_length(result)+char_length(octet_length(data)::text)+octet_length(data)+3>131072 then
        raise exception 'GROUPED_IMPORT_CODEC_LIMIT' using errcode='22023';
      end if;
      token:=convert_to('T'||octet_length(data)::text||':','UTF8')||data||convert_to(';','UTF8');
    end if;
    if octet_length(result)+octet_length(token)>131072 then
      raise exception 'GROUPED_IMPORT_CODEC_LIMIT' using errcode='22023';
    end if;
    result:=result||token;
  end loop;
  return result;
end;
$$;
revoke all on function private.grouped_import_command_bytes(text[]) from public,anon,authenticated,service_role;

create function private.grouped_import_command_sha256(p_atoms text[])
returns text language sql immutable security invoker set search_path = '' as $$
  select encode(extensions.digest(private.grouped_import_command_bytes(p_atoms),'sha256'),'hex');
$$;
revoke all on function private.grouped_import_command_sha256(text[]) from public,anon,authenticated,service_role;

commit;
