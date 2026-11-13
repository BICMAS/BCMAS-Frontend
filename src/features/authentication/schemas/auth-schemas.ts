import { z } from "zod";

const emailField = z
  .string()
  .min(1, "Work email is required")
  .email("Enter a valid work email");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
  remember: z.boolean(),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "At least 12 characters long")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[^A-Za-z0-9]/, "Include at least one symbol (!@#$%)"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const mfaSchema = z.object({
  code: z
    .string()
    .length(6, "Enter the 6-digit code")
    .regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const activateAccountSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    jobTitle: z.string().min(1, "Job title is required"),
    password: z
      .string()
      .min(12, "At least 12 characters long")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[^A-Za-z0-9]/, "Include at least one symbol (!@#$%)"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type MfaInput = z.infer<typeof mfaSchema>;
export type ActivateAccountInput = z.infer<typeof activateAccountSchema>;
