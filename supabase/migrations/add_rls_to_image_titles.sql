-- Enable RLS for image_titles table
ALTER TABLE public.image_titles ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view images
CREATE POLICY "Authenticated users can view images"
  ON public.image_titles
  FOR SELECT
  USING (auth.role() = 'authenticated');