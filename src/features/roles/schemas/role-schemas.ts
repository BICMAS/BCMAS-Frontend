import { z } from "zod";

export const createRoleSchema = z.object({
  title: z.string().min(2, "Role title is required"),
  departmentId: z.string().min(1, "Select a department"),
  overview: z.string().min(10, "Add a short role overview"),
});

export const profileSetupSchema = z.object({
  title: z.string().min(2, "Role title is required"),
  departmentId: z.string().min(1, "Select a department"),
  overview: z.string().min(10, "Describe the role objective"),
  jdText: z.string().optional(),
  useSfia: z.boolean(),
  useInternalFramework: z.boolean(),
});

export const profileReviewSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  comments: z.string().optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type ProfileSetupInput = z.infer<typeof profileSetupSchema>;
export type ProfileReviewInput = z.infer<typeof profileReviewSchema>;
