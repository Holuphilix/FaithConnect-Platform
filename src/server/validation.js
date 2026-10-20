import { z } from "zod";

const email = z.string().trim().email().max(254);
const password = z.string().min(12, "Use at least 12 characters.").max(128);

export const signupSchema = z.object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(100),
    email,
    password,
    passwordConfirmation: z.string(),
    ageConfirmed: z.literal(true, { error: "You must confirm that you are at least 18." }),
    termsAccepted: z.literal(true, { error: "You must agree to the Terms and Privacy Notice." })
}).refine((input) => input.password === input.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match."
});

export const signInSchema = z.object({ email, password: z.string().min(1).max(128) });
export const emailSchema = z.object({ email });
export const newPasswordSchema = z.object({
    password,
    passwordConfirmation: z.string()
}).refine((input) => input.password === input.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match."
});

export function validationErrors(error) {
    return Object.fromEntries(error.issues.map((issue) => [issue.path[0] || "form", issue.message]));
}
