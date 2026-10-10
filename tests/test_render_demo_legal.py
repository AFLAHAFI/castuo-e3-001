import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from render_demo_legal import render  # noqa: E402


class RenderDemoLegalTests(unittest.TestCase):
    def setUp(self):
        self.values = {
            "DEMO_LEGAL_NIF": "12345678Z",
            "DEMO_LEGAL_ADDRESS": '<Avenida & "Falsa" 12>',
            "DEMO_LEGAL_EMAIL": "demo@example.test",
        }
        self.template = (
            '<p>{{LEGAL_NIF}}</p><p>{{LEGAL_ADDRESS}}</p>'
            '<a href="mailto:{{LEGAL_EMAIL_HREF}}">{{LEGAL_EMAIL}}</a>'
        )

    def test_renders_all_fields_and_escapes_html(self):
        output = render(self.template, self.values)
        self.assertIn("12345678Z", output)
        self.assertIn("&lt;Avenida &amp; &quot;Falsa&quot; 12&gt;", output)
        self.assertIn('href="mailto:demo@example.test">demo@example.test</a>', output)
        self.assertNotIn("{{LEGAL_", output)

    def test_missing_field_fails_closed(self):
        values = dict(self.values)
        values["DEMO_LEGAL_ADDRESS"] = ""
        with self.assertRaisesRegex(ValueError, "DEMO_LEGAL_ADDRESS"):
            render(self.template, values)

    def test_email_rejects_markup_or_whitespace(self):
        values = dict(self.values)
        values["DEMO_LEGAL_EMAIL"] = 'user@example.test" onclick="alert(1)'
        with self.assertRaisesRegex(ValueError, "valid email address"):
            render(self.template, values)

    def test_refuses_unresolved_or_missing_template_markers(self):
        with self.assertRaisesRegex(ValueError, "missing required markers"):
            render("<p>{{LEGAL_NIF}}</p>", self.values)

    def test_committed_template_is_renderable_without_real_identity_values(self):
        template = (ROOT / "docs" / "demo" / "legal.html").read_text(encoding="utf-8")
        output = render(template, self.values)
        self.assertNotIn("{{LEGAL_", output)
        self.assertIn("mailto:demo@example.test", output)
        self.assertIn("Membrío pertenece al partido judicial de Valencia de Alcántara", output)
        self.assertIn("La aplicabilidad normativa no se ha evaluado formalmente", output)

    def test_public_source_keeps_identity_as_markers_only(self):
        template = (ROOT / "docs" / "demo" / "legal.html").read_text(encoding="utf-8")
        for old_placeholder in ("[NIF]", "[DOMICILIO]", "[CORREO]", "[CIUDAD]"):
            self.assertNotIn(old_placeholder, template)
        for marker in ("{{LEGAL_NIF}}", "{{LEGAL_ADDRESS}}", "{{LEGAL_EMAIL}}", "{{LEGAL_EMAIL_HREF}}"):
            self.assertIn(marker, template)


if __name__ == "__main__":
    unittest.main()
