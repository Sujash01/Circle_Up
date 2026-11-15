-- ==============================================================================
-- CircleUp Supabase Migration: Remove Auto-Confirm Trigger for Production
-- Preserves all existing confirmed users and profiles.
-- ==============================================================================

-- Drop the auto-confirm trigger from auth.users
drop trigger if exists on_auth_user_auto_confirm on auth.users;

-- Drop the associated auto-confirm trigger function
drop function if exists public.auto_confirm_new_user();
