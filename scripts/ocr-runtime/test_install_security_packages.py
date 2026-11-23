import runpy
import unittest
from pathlib import Path
from subprocess import CalledProcessError
from unittest.mock import patch


class SecurityPackagesTest(unittest.TestCase):
    def setUp(self):
        context = runpy.run_path(
            str(Path(__file__).with_name("install-security-packages.py"))
        )
        self.install = context["install"]
        self.pins = context["PINS"]
        self.arch = "arm64"
        self.before = {(name, self.arch): "1.0" for name in self.pins}
        self.before["unrelated", self.arch] = "3.0"
        self.after = dict(self.before)
        self.after.update({(name, self.arch): ver for name, ver in self.pins.items()})
        self.plan = "\n".join(f"Inst {name} ({ver})" for name, ver in self.pins.items())
        self.archived_arch = self.arch
        self.auto_states = iter(("perl-base", "", "perl-base"))
        globals_patch = patch.dict(
            self.install.__globals__,
            {"installed_packages": lambda: next(self.inventory), "read_command": self.read},
        )
        globals_patch.start()
        self.addCleanup(globals_patch.stop)
        execution_patch = patch("subprocess.run")
        self.execute = execution_patch.start()
        self.addCleanup(execution_patch.stop)

    def read(self, *args):
        match args:
            case "dpkg", "--print-architecture":
                return self.arch
            case "apt-mark", "showauto":
                return next(self.auto_states)
            case "apt-mark", "showhold":
                return ""
            case "dpkg-deb", "-f", archive, field:
                return {
                    "Package": archive.stem,
                    "Architecture": self.archived_arch,
                    "Version": self.pins[archive.stem],
                }[field]
            case "apt-get", "--simulate", *_:
                return self.plan
            case _:
                self.fail(f"Unexpected command: {args}")

    def test_verifies_and_installs_the_exact_cohort(self):
        self.inventory = iter((self.before, self.after))
        self.install()
        commands = [call.args[0] for call in self.execute.call_args_list]
        self.assertIn(("apt-mark", "auto", "perl-base"), commands)
        self.assertEqual(commands[-1], ("apt-get", "check"))
        self.assertEqual(len([cmd for cmd in commands if cmd[:2] == ("apt-get", "-y")]), 1)

    def test_allows_a_base_at_the_reviewed_versions(self):
        self.inventory = iter((self.after, self.after))
        self.auto_states = iter(("perl-base", "perl-base"))
        self.install()
        self.execute.assert_called_once_with(("apt-get", "check"), check=True)

    def test_rejects_an_extra_install_before_mutation(self):
        self.inventory = iter((self.before,))
        self.plan += "\nInst unrelated (4.0)"
        with self.assertRaisesRegex(ValueError, "outside the OCR security cohort"):
            self.install()
        self.assertTrue(
            all(call.args[0][:2] == ("dpkg", "--compare-versions")
                for call in self.execute.call_args_list)
        )

    def test_rejects_an_archive_for_a_different_architecture(self):
        self.inventory = iter((self.before,))
        self.archived_arch = "amd64"
        with self.assertRaisesRegex(ValueError, "archive identity mismatch"):
            self.install()
        self.execute.assert_not_called()

    def test_refuses_a_downgrade(self):
        self.inventory = iter((self.before,))
        self.execute.side_effect = CalledProcessError(1, "dpkg")
        with self.assertRaises(CalledProcessError):
            self.install()
        self.assertEqual(self.execute.call_count, 1)
