import test from "node:test";
import assert from "node:assert/strict";
import { emailSchema, newPasswordSchema, signInSchema, signupSchema } from "../src/server/validation.js";

const validRegistration = {
    fullName: "Ada Example",
    email: "ada@example.org",
    password: "an-example-password-42",
    passwordConfirmation: "an-example-password-42",
    ageConfirmed: true,
    termsAccepted: true
};

test("accepts a valid adult registration and trims the name", () => {
    const result = signupSchema.safeParse({ ...validRegistration, fullName: "  Ada Example  " });
    assert.equal(result.success, true);
    assert.equal(result.data.fullName, "Ada Example");
});

test("rejects invalid email, short passwords, mismatches, and missing consents", () => {
    const cases = [
        { ...validRegistration, email: "not-an-email" },
        { ...validRegistration, password: "short" },
        { ...validRegistration, passwordConfirmation: "different-password" },
        { ...validRegistration, ageConfirmed: false },
        { ...validRegistration, termsAccepted: false }
    ];
    for (const input of cases) assert.equal(signupSchema.safeParse(input).success, false);
});

test("sign-in rejects invalid email and empty password", () => {
    assert.equal(signInSchema.safeParse({ email: "bad", password: "secret" }).success, false);
    assert.equal(signInSchema.safeParse({ email: "ada@example.org", password: "" }).success, false);
});

test("recovery validates email and new password inputs", () => {
    assert.equal(emailSchema.safeParse({ email: "bad" }).success, false);
    assert.equal(newPasswordSchema.safeParse({ password: "new-password-123", passwordConfirmation: "different" }).success, false);
    assert.equal(newPasswordSchema.safeParse({ password: "new-password-123", passwordConfirmation: "new-password-123" }).success, true);
});
