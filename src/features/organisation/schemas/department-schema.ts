import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .min(2, "Department name is required")
    .max(80, "Keep the name under 80 characters"),
  tagCore: z.boolean(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
