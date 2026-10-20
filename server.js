import "dotenv/config";

import cookieParser from "cookie-parser";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createServerClient } from "@supabase/ssr";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    emailSchema,
    newPasswordSchema,
    signInSchema,
    signupSchema,
    validationErrors
} from "./src/server/validation.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8000);
const isProduction = process.env.NODE_ENV === "production";
const authConfigured = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    !/YOUR_|PLACEHOLDER/i.test(process.env.SUPABASE_URL) &&
    !/YOUR_|PLACEHOLDER/i.test(process.env.SUPABASE_PUBLISHABLE_KEY)
);
if (isProduction && (!authConfigured || !process.env.PUBLIC_APP_URL)) {
    throw new Error("Production requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and PUBLIC_APP_URL.");
}

const appUrl = new URL(process.env.PUBLIC_APP_URL || `http://localhost:${port}`);
if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
    throw new Error("PUBLIC_APP_URL must contain only the application's origin.");
}
if (isProduction && appUrl.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use HTTPS in production.");
}

if (!authConfigured) {
    console.warn("Supabase Auth is not configured; account endpoints will return 503 until it is.");
}

const cookieBaseOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
};
const cookieClearOptions = {
    httpOnly: cookieBaseOptions.httpOnly,
    secure: cookieBaseOptions.secure,
    sameSite: cookieBaseOptions.sameSite,
    path: cookieBaseOptions.path
};
const termsVersion = "2026-10-18-draft-1";
const privacyVersion = "2026-10-18-draft-1";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", isProduction ? 1 : false);
app.use(helmet());
app.use(express.json({ limit: "16kb", type: "application/json" }));
app.use(cookieParser());
app.use("/assets", express.static(path.join(ROOT, "assets"), { index: false, maxAge: isProduction ? "1d" : 0 }));
app.use("/src/css", express.static(path.join(ROOT, "src/css"), { index: false }));
app.use("/src/js", express.static(path.join(ROOT, "src/js"), { index: false }));

function supabaseForRequest(req, res) {
    return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { flowType: "pkce", autoRefreshToken: true, detectSessionInUrl: false, persistSession: true },
        cookies: {
            getAll() {
                return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }));
            },
            setAll(cookiesToSet) {
                for (const { name, value, options } of cookiesToSet) {
                    const clearing = value === "" || options?.maxAge === 0;
                    res.cookie(name, value, {
                        ...options,
                        ...cookieBaseOptions,
                        maxAge: clearing ? 0 : cookieBaseOptions.maxAge
                    });
                }
            }
        }
    });
}

function apiResponse(res, status = 200) {
    res.set("Cache-Control", "no-store");
    return res.status(status);
}

function requireSameOrigin(req, res, next) {
    const origin = req.get("origin");
    if (!origin || origin !== appUrl.origin) {
        return apiResponse(res, 403).json({ error: "This request could not be verified. Reload the page and try again." });
    }
    next();
}

function requireAuthConfiguration(_req, res, next) {
    if (!authConfigured) {
        return apiResponse(res, 503).json({ error: "Account access is not configured yet. Please try again later." });
    }
    next();
}

function requirePasswordRecovery(req, res, next) {
    if (req.cookies?.["fc-password-recovery"] !== "1") {
        return apiResponse(res, 403).json({ error: "Use the password recovery link sent to your email to set a new password." });
    }
    next();
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Wait a while and try again." }
});
const recoveryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many recovery requests. Please try again later." }
});

app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/register", (_req, res) => res.sendFile(path.join(ROOT, "src/pages/register.html")));
app.get("/sign-in", (_req, res) => res.sendFile(path.join(ROOT, "src/pages/sign-in.html")));
app.get("/forgot-password", (_req, res) => res.sendFile(path.join(ROOT, "src/pages/forgot-password.html")));
app.get("/terms", (_req, res) => res.sendFile(path.join(ROOT, "src/pages/terms.html")));
app.get("/privacy", (_req, res) => res.sendFile(path.join(ROOT, "src/pages/privacy.html")));

async function verifiedUserFor(req, res) {
    const supabase = supabaseForRequest(req, res);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || !data.user.email_confirmed_at) return { supabase, user: null };
    return { supabase, user: data.user };
}

app.get("/account", async (req, res, next) => {
    if (!authConfigured) return res.redirect(303, "/sign-in?notice=setup");
    try {
        const { user } = await verifiedUserFor(req, res);
        if (!user) return res.redirect(303, "/sign-in?notice=verify");
        res.set("Cache-Control", "no-store").sendFile(path.join(ROOT, "src/pages/account.html"));
    } catch (error) {
        next(error);
    }
});

app.get("/reset-password", async (req, res, next) => {
    if (!authConfigured) return res.redirect(303, "/sign-in?notice=setup");
    if (req.cookies?.["fc-password-recovery"] !== "1") return res.redirect(303, "/forgot-password?notice=link-expired");
    try {
        const { user } = await verifiedUserFor(req, res);
        if (!user) return res.redirect(303, "/sign-in?notice=recovery");
        res.set("Cache-Control", "no-store").sendFile(path.join(ROOT, "src/pages/reset-password.html"));
    } catch (error) {
        next(error);
    }
});

app.get("/api/auth/session", requireAuthConfiguration, async (req, res, next) => {
    try {
        const { user } = await verifiedUserFor(req, res);
        if (!user) return apiResponse(res, 401).json({ authenticated: false });
        return apiResponse(res).json({
            authenticated: true,
            email: user.email,
            fullName: user.user_metadata?.full_name || "FaithConnect member"
        });
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/register", requireSameOrigin, requireAuthConfiguration, authLimiter, async (req, res, next) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return apiResponse(res, 400).json({ errors: validationErrors(parsed.error) });

    try {
        const input = parsed.data;
        const supabase = supabaseForRequest(req, res);
        const { error } = await supabase.auth.signUp({
            email: input.email,
            password: input.password,
            options: {
                emailRedirectTo: new URL("/auth/callback", appUrl).toString(),
                data: {
                    full_name: input.fullName,
                    terms_version: termsVersion,
                    privacy_version: privacyVersion,
                    consent_recorded_at: new Date().toISOString()
                }
            }
        });

        // Keep responses intentionally generic so account existence is not disclosed.
        if (error) return apiResponse(res, 400).json({ error: "We could not create the account. Check your details or try signing in or recovering your password." });
        return apiResponse(res, 202).json({
            message: "If this address can be registered, a verification email will arrive shortly. Verify your email before signing in."
        });
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/sign-in", requireSameOrigin, requireAuthConfiguration, authLimiter, async (req, res, next) => {
    const parsed = signInSchema.safeParse(req.body);
    if (!parsed.success) return apiResponse(res, 400).json({ errors: validationErrors(parsed.error) });

    try {
        const supabase = supabaseForRequest(req, res);
        const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error || !data.user?.email_confirmed_at) {
            return apiResponse(res, 401).json({ error: "Email or password is incorrect, or the email address has not been verified." });
        }
        return apiResponse(res).json({ redirect: "/account" });
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/recover", requireSameOrigin, requireAuthConfiguration, recoveryLimiter, async (req, res, next) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return apiResponse(res, 400).json({ errors: validationErrors(parsed.error) });
    try {
        const supabase = supabaseForRequest(req, res);
        const redirectTo = new URL("/auth/callback?next=%2Freset-password", appUrl).toString();
        const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
        if (error) return apiResponse(res, 502).json({ error: "Password recovery is temporarily unavailable. Try again later." });
        return apiResponse(res).json({ message: "If an account exists for that address, password recovery instructions will arrive shortly." });
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/new-password", requireSameOrigin, requireAuthConfiguration, requirePasswordRecovery, authLimiter, async (req, res, next) => {
    const parsed = newPasswordSchema.safeParse(req.body);
    if (!parsed.success) return apiResponse(res, 400).json({ errors: validationErrors(parsed.error) });
    try {
        const { supabase, user } = await verifiedUserFor(req, res);
        if (!user) return apiResponse(res, 401).json({ error: "Your recovery session has expired. Request a new recovery email." });
        const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
        if (error) return apiResponse(res, 400).json({ error: "The password could not be updated. Try a different password." });
        res.clearCookie("fc-password-recovery", cookieClearOptions);
        return apiResponse(res).json({ redirect: "/account" });
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/sign-out", requireSameOrigin, requireAuthConfiguration, authLimiter, async (req, res, next) => {
    try {
        const supabase = supabaseForRequest(req, res);
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) return apiResponse(res, 502).json({ error: "Sign-out could not be confirmed. Try again." });
        res.clearCookie("fc-password-recovery", cookieClearOptions);
        return apiResponse(res, 204).end();
    } catch (error) {
        next(error);
    }
});

app.get("/auth/callback", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!authConfigured) return res.redirect(303, "/sign-in?notice=setup");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const nextPath = req.query.next === "/reset-password" ? "/reset-password" : "/account";
    if (!code) return res.redirect(303, "/sign-in?notice=link-expired");
    try {
        const supabase = supabaseForRequest(req, res);
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return res.redirect(303, "/sign-in?notice=link-expired");
        if (nextPath === "/reset-password") {
            res.cookie("fc-password-recovery", "1", { ...cookieBaseOptions, maxAge: 15 * 60 * 1000 });
        }
        return res.redirect(303, nextPath);
    } catch {
        return res.redirect(303, "/sign-in?notice=link-expired");
    }
});

app.use((req, res) => {
    if (req.path.startsWith("/api/")) return apiResponse(res, 404).json({ error: "Not found." });
    return res.status(404).sendFile(path.join(ROOT, "src/pages/not-found.html"));
});

app.use((error, _req, res, _next) => {
    // Avoid logging request bodies or provider errors, which can contain private data.
    console.error("Request failed", { name: error?.name || "Error" });
    if (res.headersSent) return;
    const status = error?.status === 413 ? 413 : 500;
    return apiResponse(res, status).json({ error: status === 413 ? "Request is too large." : "The request could not be completed. Try again." });
});

app.listen(port, isProduction ? "0.0.0.0" : "127.0.0.1", () => {
    console.log(`FaithConnect is listening on ${appUrl.origin}`);
});
