-- Fix: Drop the overly permissive policy that allows all authenticated users to view all roles
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;

-- Users can only see their own role
CREATE POLICY "Users can view own role" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admins can see all roles (needed for team management)
CREATE POLICY "Admins can view all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));