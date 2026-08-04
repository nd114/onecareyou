import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { JobListing } from "@/lib/job-listings";

export interface JobPosting {
  id: string;
  slug: string;
  title: string;
  category: string;
  type: "paid" | "commission" | "advisory" | "contract" | "volunteer";
  commitment: string;
  location: string;
  description: string;
  full_description: string;
  responsibilities: string[];
  qualifications: string[];
  nice_to_have: string[];
  icon_name: JobListing["iconName"];
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type JobPostingInput = Omit<JobPosting, "id" | "created_at" | "updated_at">;

export const emptyJobPosting: JobPostingInput = {
  slug: "",
  title: "",
  category: "General",
  type: "paid",
  commitment: "Contract",
  location: "Remote",
  description: "",
  full_description: "",
  responsibilities: [],
  qualifications: [],
  nice_to_have: [],
  icon_name: "Users",
  is_published: true,
  sort_order: 0,
};

/** Maps a database posting to the shape the public careers pages render. */
export function toJobListing(p: JobPosting): JobListing {
  return {
    id: p.slug,
    title: p.title,
    category: p.category,
    type: p.type,
    commitment: p.commitment,
    location: p.location,
    description: p.description,
    fullDescription: p.full_description,
    responsibilities: p.responsibilities ?? [],
    qualifications: p.qualifications ?? [],
    niceToHave: p.nice_to_have?.length ? p.nice_to_have : undefined,
    iconName: p.icon_name,
  };
}

/** Published jobs for the public careers pages. */
export function usePublishedJobs() {
  return useQuery({
    queryKey: ["job-postings", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_postings")
        .select("*")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as JobPosting[];
    },
  });
}

/** All jobs, published or not — admin only (RLS enforced). */
export function useAllJobs() {
  return useQuery({
    queryKey: ["job-postings", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_postings").select("*").order("sort_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as JobPosting[];
    },
  });
}

export function useJobMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["job-postings"] });

  const createJob = useMutation({
    mutationFn: async (input: JobPostingInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("job_postings").insert({ ...input, created_by: userData.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, ...input }: Partial<JobPostingInput> & { id: string }) => {
      const { error } = await supabase.from("job_postings").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_postings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createJob, updateJob, deleteJob };
}
