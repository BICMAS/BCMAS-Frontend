import { z } from "zod";

/**
 * Example Zod schema — replace with real form schemas during screen migration.
 */
export const loginSchema = z.object({
  email: z.string().email("Enter a valid work email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  remember: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
