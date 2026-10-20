"""Dependency-free smoke checks for the static FaithConnect homepage."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SERVER_ROUTES = {
    "/", "/register", "/sign-in", "/forgot-password", "/reset-password",
    "/account", "/terms", "/privacy"
}


def _relative_luminance(hex_color):
    channels = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    channels = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def _contrast_ratio(first, second):
    lighter, darker = sorted((_relative_luminance(first), _relative_luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


class HomepageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.references = []
        self.headings = []
        self.images = []
        self.buttons = []
        self._heading = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if "id" in attributes:
            self.ids.append(attributes["id"])
        for attribute in ("href", "src"):
            if attributes.get(attribute):
                self.references.append(attributes[attribute])
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._heading = tag
            self.headings.append(tag)
        if tag == "img":
            self.images.append(attributes)
        if tag == "button":
            self.buttons.append(attributes)

    def handle_endtag(self, tag):
        if tag == self._heading:
            self._heading = None


class StaticHomepageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.css = (ROOT / "src/css/styles.css").read_text(encoding="utf-8")
        cls.js = (ROOT / "src/js/app.js").read_text(encoding="utf-8")
        cls.parser = HomepageParser()
        cls.parser.feed(cls.html)

    def test_ids_are_unique_and_internal_links_resolve(self):
        self.assertEqual(len(self.parser.ids), len(set(self.parser.ids)))
        page_ids = set(self.parser.ids)
        for reference in self.parser.references:
            parsed = urlsplit(reference)
            if parsed.scheme or parsed.netloc:
                continue
            if parsed.path in SERVER_ROUTES:
                continue
            if parsed.path:
                target = (ROOT / parsed.path.lstrip("/")) if parsed.path.startswith("/") else ROOT / parsed.path
                self.assertTrue(target.is_file(), f"Missing local reference: {reference}")
            if parsed.fragment and (not parsed.path or parsed.path == "index.html"):
                self.assertIn(parsed.fragment, page_ids, f"Unresolved in-page link: {reference}")

    def test_page_has_document_title_landmarks_and_one_h1(self):
        self.assertIn("<title>FaithConnect", self.html)
        self.assertIn('id="main-content"', self.html)
        self.assertIn('aria-label="Main navigation"', self.html)
        self.assertEqual(self.parser.headings.count("h1"), 1)

    def test_hero_image_exists_and_has_alternative_text(self):
        hero_images = [image for image in self.parser.images if "hero-couple-image" in image.get("class", "")]
        self.assertEqual(len(hero_images), 1)
        image = hero_images[0]
        self.assertTrue((ROOT / image["src"]).is_file())
        self.assertTrue(image.get("alt", "").strip())
        self.assertEqual(image.get("fetchpriority"), "high")

    def test_menu_control_has_matching_navigation_and_javascript(self):
        self.assertIn('id="menuToggle"', self.html)
        self.assertIn('aria-controls="navLinks"', self.html)
        self.assertIn('id="navLinks"', self.html)
        self.assertIn('aria-expanded="false"', self.html)
        self.assertIn('event.key === "Escape"', self.js)
        self.assertIn('setMenuOpen(false)', self.js)
        self.assertIn("clickedOutside", self.js)
        self.assertIn("addEventListener(\"resize\"", self.js)
        self.assertIn(".nav-links a.button:hover", self.css)

    def test_homepage_links_to_account_flows_and_marks_matchmaking_as_planned(self):
        self.assertIn('href="/register"', self.html)
        self.assertIn('href="/sign-in"', self.html)
        self.assertIn("Email verification is required", self.html)
        self.assertIn("Profiles, recommendations, and messaging are still in development", self.html)
        self.assertNotIn("localStorage", self.js)
        self.assertNotIn("sessionStorage", self.js)

    def test_auth_pages_collect_explicit_consent_and_have_labels(self):
        register = (ROOT / "src/pages/register.html").read_text(encoding="utf-8")
        self.assertIn('name="ageConfirmed"', register)
        self.assertIn('name="termsAccepted"', register)
        self.assertIn('href="/terms"', register)
        self.assertIn('href="/privacy"', register)
        self.assertEqual(register.count('type="password"'), 2)
        self.assertIn('autocomplete="email"', register)
        for page in ("sign-in.html", "forgot-password.html", "reset-password.html"):
            content = (ROOT / "src/pages" / page).read_text(encoding="utf-8")
            self.assertIn("<form", content)
            self.assertIn("<label", content)
            self.assertIn("auth.js", content)

    def test_auth_server_uses_server_side_sessions_and_protected_account_route(self):
        server = (ROOT / "server.js").read_text(encoding="utf-8")
        self.assertIn('from "@supabase/ssr"', server)
        self.assertIn("httpOnly: true", server)
        self.assertIn('sameSite: "lax"', server)
        self.assertIn('app.get("/account"', server)
        self.assertIn("email_confirmed_at", server)
        self.assertIn("requireSameOrigin", server)
        self.assertIn("recoveryLimiter", server)
        self.assertIn("requirePasswordRecovery", server)
        self.assertIn('"fc-password-recovery"', server)
        self.assertNotIn("service_role", server)
        self.assertNotIn("localStorage", server)

    def test_registration_consent_is_versioned_and_drafts_are_disclosed(self):
        server = (ROOT / "server.js").read_text(encoding="utf-8")
        privacy = (ROOT / "src/pages/privacy.html").read_text(encoding="utf-8")
        terms = (ROOT / "src/pages/terms.html").read_text(encoding="utf-8")
        self.assertIn("terms_version", server)
        self.assertIn("privacy_version", server)
        self.assertIn("DRAFT NOTICE", privacy)
        self.assertIn("require legal review", terms)

    def test_css_has_responsive_accessibility_and_balanced_blocks(self):
        self.assertEqual(self.css.count("{"), self.css.count("}"))
        self.assertIn(":focus-visible", self.css)
        self.assertIn("prefers-reduced-motion", self.css)
        self.assertIn("object-fit: cover", self.css)
        self.assertIn("@media (max-width: 900px)", self.css)
        self.assertIn("@media (max-width: 760px)", self.css)

    def test_main_text_color_combinations_meet_aa_contrast(self):
        root_block = re.search(r":root\s*{([^}]+)}", self.css).group(1)
        tokens = dict(re.findall(r"(--[\w-]+):\s*(#[\da-fA-F]{6})", root_block))
        self.assertGreaterEqual(_contrast_ratio(tokens["--muted"], tokens["--background"]), 4.5)
        self.assertGreaterEqual(_contrast_ratio(tokens["--muted"], tokens["--surface"]), 4.5)
        self.assertGreaterEqual(_contrast_ratio(tokens["--text"], tokens["--primary-light"]), 4.5)
        self.assertGreaterEqual(_contrast_ratio("#606a62", "#edf2eb"), 4.5)


if __name__ == "__main__":
    unittest.main()
