# Demo seed

The demo data scripts that used to live here were applied as migrations
(`20260818234905_…` and `20260818235007_…`), so that is where they are now.
Keeping a second copy here would leave two versions to drift apart.

Both are written to be safe anywhere: they seed only `demo-*@onecare.you`
accounts and do nothing at all when those accounts are absent, so a fresh or
production database replays them as a no-op. Both clear their own rows before
inserting, so re-running never doubles up.

The Health Vault documents still need their files uploaded to
`health-documents/<demo patient user_id>/` before the rows point at anything.
