-- The homepage now uses static editorial entries. Remove the security-definer
-- projection entirely so neither anonymous nor authenticated API callers can
-- sample other users' saved quotation text or attribution.
drop function if exists public.get_random_homepage_quote();

-- Refresh the REST schema cache immediately after retiring the RPC.
notify pgrst, 'reload schema';
