-- 1. Create a function that handles the insertion into api_tenants
-- This function runs as SECURITY DEFINER, meaning it bypasses RLS
CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.api_tenants (bank_name, admin_name, official_email, phone_number, status)
    VALUES (
        COALESCE(new.raw_user_meta_data->>'bank_name', 'Unknown Bank'),
        COALESCE(new.raw_user_meta_data->>'admin_name', 'Admin'),
        new.email,
        COALESCE(new.raw_user_meta_data->>'phone_number', 'Not Provided'),
        'PENDING'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a trigger that calls the function whenever a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant();

-- 3. Cleanup: Remove the problematic INSERT policy (if it exists)
-- Since the trigger handles the insert, you only need SELECT/UPDATE policies
DROP POLICY IF EXISTS "Allow tenant insert with matching email" ON public.api_tenants;

-- 4. Ensure Users can view their own tenant record
DROP POLICY IF EXISTS "Tenants can view their own data" ON public.api_tenants;
CREATE POLICY "Tenants can view their own data" ON public.api_tenants
    FOR SELECT TO authenticated USING (auth.jwt() ->> 'email' = official_email);
