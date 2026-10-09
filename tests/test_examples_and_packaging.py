import json
import re
import subprocess
import sys
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
CLI = ROOT / "scripts" / "e3bundle.py"
EXAMPLES = ROOT / "examples" / "bundles"


def verify(bundle: Path, *extra: object) -> tuple[int, dict]:
    proc = subprocess.run([sys.executable, str(CLI), "verify", str(bundle), *map(str, extra)], capture_output=True, text=True)
    return proc.returncode, json.loads(proc.stdout)


class CommittedExampleTests(unittest.TestCase):
    trusted = EXAMPLES / "trusted-keys.json"

    def test_valid_example_verifies_with_pinned_keys(self):
        code, report = verify(EXAMPLES / "valid", "--min-signatures", 2, "--trusted-keys", self.trusted)
        self.assertEqual(code, 0, report["findings"])
        self.assertEqual(report["signatures_trusted"], 2)

    def test_tampered_example_fails_on_the_edited_file(self):
        code, report = verify(EXAMPLES / "tampered", "--min-signatures", 2, "--trusted-keys", self.trusted)
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"], ["hash mismatch: data/readings.csv"])

    def test_examples_contain_no_private_keys(self):
        for path in EXAMPLES.rglob("*"):
            if path.is_file():
                self.assertNotRegex(path.name, r"\.(key|pem)$")
                self.assertNotIn("private", path.read_text(encoding="utf-8").lower())


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]

    def test_console_script_points_to_cli_main(self):
        self.assertEqual(self.project["scripts"]["e3bundle"], "e3bundle:main")

    def test_runtime_dependencies_match_requirements(self):
        requirements = [line.strip() for line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#")]
        self.assertEqual(self.project["dependencies"], requirements)

    def test_version_is_listed_in_changelog(self):
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        version = self.project["version"]
        if f"## [{version}]" in changelog:
            return

        section_start = changelog.find("## [Unreleased]")
        self.assertGreaterEqual(section_start, 0, "Changelog must have an Unreleased section before a version is tagged.")
        section_end = changelog.find("\n## [", section_start + len("## [Unreleased]"))
        if section_end < 0:
            section_end = len(changelog)
        unreleased = changelog[section_start:section_end]
        self.assertIn(
            "**Candidate package version:** `" + version + "` (not tagged or released yet).",
            unreleased,
        )


if __name__ == "__main__":
    unittest.main()
