REVOKE ALL ON FUNCTION public.sync_storage_ledger_dictation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_storage_ledger_document() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_storage_ledger_dictation() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_storage_ledger_document() TO service_role;