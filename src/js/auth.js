"use strict";

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.passwordToggle);
            if (!input) return;
            const shouldShow = input.type === "password";
            input.type = shouldShow ? "text" : "password";
            button.textContent = shouldShow ? "Hide" : "Show";
            const label = input.labels?.[0]?.textContent.trim() || "password";
            button.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} ${label.toLowerCase()}`);
        });
    });

    const queryNotice = document.querySelector("[data-query-notice]");
    if (queryNotice) {
        const notices = {
            setup: "Account access has not been connected to its authentication service yet. Please try again later.",
            verify: "Verify your email address before signing in. Check your inbox for the confirmation link.",
            recovery: "Your recovery session is missing or expired. Request a new password recovery email.",
            "link-expired": "That verification or recovery link is invalid or expired. Request a new email and try again."
        };
        queryNotice.textContent = notices[new URLSearchParams(window.location.search).get("notice")] || "";
    }

    document.querySelectorAll("[data-auth-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submit = form.querySelector("[type='submit']");
            const message = form.querySelector("[data-form-message]");
            const errorFields = form.querySelectorAll("[data-error-for]");
            errorFields.forEach((node) => { node.textContent = ""; });
            form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
            if (message) message.textContent = "";

            const values = Object.fromEntries(new FormData(form).entries());
            if (form.querySelector("[name='ageConfirmed']")) {
                values.ageConfirmed = Boolean(form.querySelector("[name='ageConfirmed']").checked);
            }
            if (form.querySelector("[name='termsAccepted']")) {
                values.termsAccepted = Boolean(form.querySelector("[name='termsAccepted']").checked);
            }

            if (submit) {
                submit.disabled = true;
                submit.dataset.originalText = submit.textContent;
                submit.textContent = "Please wait…";
            }

            try {
                const response = await fetch(form.action, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: form.method.toLowerCase() === "post" && form.querySelector("[name]") ? JSON.stringify(values) : undefined
                });
                const result = response.status === 204 ? {} : await response.json();
                if (!response.ok) {
                    if (result.errors) {
                        for (const [name, text] of Object.entries(result.errors)) {
                            const errorNode = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
                            const input = form.elements.namedItem(name);
                            if (errorNode) errorNode.textContent = text;
                            if (input && "setAttribute" in input) input.setAttribute("aria-invalid", "true");
                        }
                        if (message) message.textContent = "Please check the highlighted fields.";
                    } else if (message) {
                        message.textContent = result.error || "We could not complete that request. Please try again.";
                    }
                    return;
                }

                if (result.redirect) {
                    window.location.assign(result.redirect);
                    return;
                }
                if (message) message.textContent = result.message || "Your request is complete.";
                if (form.action.endsWith("/sign-out")) window.location.assign("/");
            } catch {
                if (message) message.textContent = "The service could not be reached. Check your connection and try again.";
            } finally {
                if (submit) {
                    submit.disabled = false;
                    submit.textContent = submit.dataset.originalText;
                }
            }
        });
    });

    const accountName = document.querySelector("[data-account-name]");
    if (accountName) {
        fetch("/api/auth/session", { credentials: "same-origin", headers: { "Accept": "application/json" } })
            .then((response) => {
                if (!response.ok) throw new Error("Session expired");
                return response.json();
            })
            .then((session) => {
                accountName.textContent = session.fullName;
                const email = document.querySelector("[data-account-email]");
                if (email) email.textContent = session.email;
            })
            .catch(() => window.location.assign("/sign-in?notice=verify"));
    }
});
