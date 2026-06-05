CREATE OR REPLACE FUNCTION public.can_edit_content(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_active_user(_user_id) AND (
    public.has_role(_user_id, 'admin') OR
    public.has_role(_user_id, 'creator') OR
    public.has_role(_user_id, 'reviewer') OR
    public.has_role(_user_id, 'manager')
  )
$function$;