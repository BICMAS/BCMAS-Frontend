import { z } from "zod";

const emailField = z
  .string()
  .min(1, "Work email is required")
  .email("Enter a valid work email");

/** The backend must also refuse passwords known from leaks. */
const newPassword = z
  .string()
  .min(12, "At least 12 characters long")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[^A-Za-z0-9]/, "Include at least one symbol (!@#$%)")
  .refine((text) => !/password|bicmas/i.test(text), "Choose something harder to guess");

const sixDigits = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const activationCodeSchema = z.object({
  email: emailField,
  code: z.string().refine((text) => text.replace(/[^A-Za-z0-9]/g, "").length === 12, "Enter the 12-character code"),
});

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
    emailCode: sixDigits,
    mfaCode: sixDigits,
    password: newPassword,
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
    emailCode: sixDigits,
    password: newPassword,
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
export type ActivationCodeInput = z.infer<typeof activationCodeSchema>;
