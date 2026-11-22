# CircleUp – Supabase Email Verification Migration Guide

## 1. Executive Summary & Purpose

This migration removes the legacy auto-confirm database trigger and function on `auth.users` in Supabase to enforce mandatory email verification for all new customer signups.

### Migration File
`supabase/migrations/20261115_remove_auto_confirm.sql`

```sql
-- Drop the auto-confirm trigger from auth.users
drop trigger if exists on_auth_user_auto_confirm on auth.users;

-- Drop the associated auto-confirm trigger function
drop function if exists public.auto_confirm_new_user();
```

---

## 2. Trigger and Function Inspection

### Origin
The trigger and function were originally created in `supabase/migrations/20261115_create_profiles.sql` (lines 77–93):
```sql
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := timezone('utc'::text, now());
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();
```

### Dependency Audit
1. **Unrelated Triggers**: The profile creation trigger on `auth.users` is `on_auth_user_created`, which executes `public.handle_new_user()` (lines 42–67 of `20261115_create_profiles.sql`). It is completely independent and unaffected.
2. **Application Code**: Neither frontend nor backend references `auto_confirm_new_user` or `on_auth_user_auto_confirm`.
3. **Target Scope**: The migration drops ONLY `on_auth_user_auto_confirm` and `public.auto_confirm_new_user()`. Profile provisioning, RLS policies, customer roles, and existing confirmed users remain untouched.
4. **Idempotency**: Both statements utilize `IF EXISTS`, making the migration completely safe to execute or rerun.

---

## 3. Existing-User Preflight & Read-Only Inspection

Before applying any migration, run these read-only inspection queries in the Supabase SQL Editor:

```sql
-- 1. Check if the auto-confirm trigger currently exists on auth.users
SELECT 
    trigger_name, 
    event_manipulation, 
    event_object_table, 
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_auto_confirm';

-- 2. Check if the auto_confirm_new_user function exists
SELECT 
    proname, 
    prosecdef, 
    prosrc 
FROM pg_proc 
WHERE proname = 'auto_confirm_new_user';

-- 3. List all active triggers on auth.users to verify no collateral dependencies
SELECT 
    tgname AS trigger_name, 
    tgrelid::regclass AS table_name, 
    proname AS target_function
FROM pg_trigger 
JOIN pg_proc ON tgfoid = pg_proc.oid 
WHERE tgrelid = 'auth.users'::regclass;

-- 4. Count existing unconfirmed users
SELECT 
    COUNT(*) AS unconfirmed_user_count 
FROM auth.users 
WHERE email_confirmed_at IS NULL;

-- 5. Inspect unconfirmed user details (for manual review)
SELECT 
    id, 
    email, 
    created_at, 
    raw_user_meta_data 
FROM auth.users 
WHERE email_confirmed_at IS NULL 
ORDER BY created_at DESC;
```

### Existing-User Preflight Policy
> [!IMPORTANT]
> **Do NOT automatically require the count of unconfirmed users to be zero, and do NOT bulk-update existing unconfirmed accounts.**

1. **Reporting Count**: Record the number of unconfirmed users prior to migration.
2. **Identifying Legitimate Customers**:
   - For customer/order cross-references, use the existing Supabase `customers` and `orders` records through the authenticated backend. Resolve customers by their stored identifiers; do not infer identity from similar names.
   - Check creation timestamps: recent unconfirmed signups may represent customers in mid-registration, while older accounts may represent abandonments or invalid test email addresses.
3. **Impact on Existing Unverified Accounts**:
   - Accounts with existing active sessions or valid refresh tokens on their client devices will continue to function until session expiry.
   - If an unconfirmed user signs out or attempts a new password login at `/signin`, Supabase will reject the sign-in with `"Email not confirmed"`.
   - The user can trigger a new confirmation link using `resendVerificationEmail()` from the login screen.
4. **Safe Manual Review Procedure**:
   - If a customer contacts support reporting that they cannot log in and their identity has been manually verified by support staff, an administrator may selectively confirm that individual user:
     ```sql
     -- Safe, targeted single-user manual confirmation:
     UPDATE auth.users 
     SET email_confirmed_at = timezone('utc'::text, now()) 
     WHERE id = '<exact-user-uuid>' 
       AND email = '<exact-customer-email>' 
       AND email_confirmed_at IS NULL;
     ```
   - **Never run bulk unconstrained `UPDATE auth.users` statements.**

---

## 4. Pre-Flight Dashboard Checklist

Before dropping the trigger in Supabase:
1. **Supabase Dashboard → Authentication → Providers → Email**:
   - Enable Email provider: **ON**
   - Confirm email: **ON**
   - Secure email change: **ON**
2. **Supabase Dashboard → Authentication → SMTP Settings**:
   - Custom SMTP: **ON**
   - Host, Port, Username, Sender Email configured (e.g. Resend / SendGrid / AWS SES).
   - Click **Send Test Email** and verify receipt in your inbox.
3. **Supabase Dashboard → Authentication → URL Configuration**:
   - **Site URL**: `https://circleuponline.com`
   - **Redirect URLs** must contain:
     - `https://circleuponline.com/**`
     - `https://circleuponline.com/auth/callback`
     - `https://circleuponline.com/signin`
     - `https://circleuponline.com/account`
     - `http://localhost:5173/**` (for local development only)

---

## 5. Corrected Rollback SQL Script

If email deliverability issues occur or automatic confirmation must be temporarily restored, execute this SQL in the Supabase SQL Editor:

```sql
-- ==============================================================================
-- ROLLBACK SCRIPT: Restore Auto-Confirm Trigger for CircleUp
-- Restores BEFORE INSERT trigger; preserves existing user confirmation states.
-- NEVER bulk-updates existing accounts.
-- ==============================================================================

-- 1. Recreate the auto-confirm function (matches original definition exactly)
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := timezone('utc'::text, now());
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Re-attach the trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_new_user();
```

### Rollback Guarantees & Limitations
- **Guarantees**:
  - Restores the exact original trigger definition and `SECURITY DEFINER` function.
  - Leaves all existing user confirmation states (`email_confirmed_at`) untouched.
  - Does not modify any other triggers (such as `on_auth_user_created`).
  - Zero bulk data updates.
- **Limitations After Signups Have Occurred**:
  - The trigger is a `BEFORE INSERT` trigger. Recreating it will automatically confirm only **subsequent** signups going forward.
  - Any users who registered during the window when email verification was active and did not verify their email will **remain unconfirmed**.
  - To handle those users, either let them complete email verification via the link, or conduct a manual review per Section 3.

---

## 6. End-to-End Verification Test Procedure

After applying the migration SQL and enabling dashboard settings, execute this 5-step test:

1. **Test Signup (Unconfirmed State)**:
   - Go to `/signup`.
   - Register a new account with a valid test email address.
   - Verify that Supabase does **not** return a session token immediately.
   - In Supabase SQL Editor, verify `email_confirmed_at` is `NULL`:
     ```sql
     SELECT id, email, email_confirmed_at FROM auth.users WHERE email = 'testuser@example.com';
     ```

2. **Test Protected Route Rejection**:
   - Attempt to access `/account` or execute a customer-authenticated checkout.
   - Verify that unverified state prevents access or prompts for verification.
   - Attempt to call `POST /api/v1/orders` without a valid Supabase JWT; verify the backend rejects with 401/403.

3. **Test Confirmation Link**:
   - Check the test email inbox for the confirmation email sent by Supabase.
   - Click the verification link.
   - Verify that the browser lands on `/auth/callback` and is redirected to `/signin?verified=true` (handled in `AuthCallbackPage.tsx`).
   - Query Supabase to confirm `email_confirmed_at` is now populated with a UTC timestamp:
     ```sql
     SELECT id, email, email_confirmed_at FROM auth.users WHERE email = 'testuser@example.com';
     ```

4. **Test Post-Verification Sign In**:
   - Sign in at `/signin` with the newly verified credentials.
   - Verify successful session initialization and customer dashboard access.

5. **Test Password Reset & Resend Flows**:
   - Trigger "Forgot Password" from `/signin`. Verify password reset email arrives with correct link to `/auth/reset-password`.
   - Trigger `resendVerificationEmail()` for a pending signup; verify a new confirmation email is received.
