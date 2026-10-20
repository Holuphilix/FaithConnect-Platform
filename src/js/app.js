"use strict";

/* Homepage navigation and current-year enhancement. Account flows live in auth.js. */

document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.getElementById("menuToggle");
    const navLinks = document.getElementById("navLinks");
    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = String(new Date().getFullYear());
    }

    if (!menuToggle || !navLinks) {
        return;
    }

    const mobileNavigation = window.matchMedia("(max-width: 900px)");

    const setMenuOpen = (isOpen, restoreFocus = false) => {
        navLinks.classList.toggle("open", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation menu" : "Open navigation menu"
        );
        menuToggle.textContent = isOpen ? "×" : "☰";

        if (restoreFocus) {
            menuToggle.focus();
        }
    };

    menuToggle.addEventListener("click", () => {
        setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
    });

    navLinks.querySelectorAll("a[href^='#']").forEach((link) => {
        link.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
            setMenuOpen(false, true);
        }
    });

    document.addEventListener("click", (event) => {
        const clickedOutside = !navLinks.contains(event.target) && !menuToggle.contains(event.target);
        if (mobileNavigation.matches && clickedOutside) {
            setMenuOpen(false);
        }
    });

    window.addEventListener("resize", () => {
        if (!mobileNavigation.matches) {
            setMenuOpen(false);
        }
    });
});
