import contextlib
import io
import sys
import unittest
from unittest.mock import patch

from app import __main__ as launcher
from app.server import WorkbenchServer


class WorkbenchLaunchTests(unittest.TestCase):
    def test_a_second_server_cannot_share_the_same_loopback_port(self):
        with WorkbenchServer(0) as occupied:
            with self.assertRaises(OSError):
                with WorkbenchServer(occupied.server_port):
                    pass

    def run_main(self, *args):
        output = io.StringIO()
        with patch.object(sys, "argv", ["workbench", *args]), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            try:
                result = launcher.main()
            except SystemExit as error:
                result = error.code
            except OSError as error:
                self.fail(f"Startup leaked an OS error instead of a useful launch message: {error}")
        return result, output.getvalue()

    def test_open_uses_the_bound_port(self):
        with patch.object(launcher, "open_browser", create=True) as open_browser, patch.object(WorkbenchServer, "serve_forever", side_effect=KeyboardInterrupt):
            result, _ = self.run_main("--port", "0", "--open")
        self.assertEqual(result, 0)
        open_browser.assert_called_once()
        self.assertRegex(open_browser.call_args.args[0], r"^http://127\.0\.0\.1:[1-9][0-9]*/$")

    def test_occupied_port_can_fall_back_without_closing_the_listener(self):
        with WorkbenchServer(0) as occupied:
            if occupied.server_port > 65525:
                self.skipTest("The OS chose a port too near the end of the fallback range")
            with patch.object(launcher, "open_browser", create=True) as open_browser, patch.object(WorkbenchServer, "serve_forever", side_effect=KeyboardInterrupt):
                result, output = self.run_main("--port", str(occupied.server_port), "--open", "--auto-port")
            self.assertEqual(result, 0, output)
            opened_port = int(open_browser.call_args.args[0].split(":")[-1].strip("/"))
            self.assertGreater(opened_port, occupied.server_port)
            self.assertLess(opened_port, occupied.server_port + 10)
            self.assertNotEqual(occupied.socket.fileno(), -1)

    def test_busy_port_without_fallback_has_a_clear_message(self):
        with WorkbenchServer(0) as occupied, patch.object(launcher, "open_browser", create=True) as open_browser, patch.object(WorkbenchServer, "serve_forever", side_effect=KeyboardInterrupt):
            result, output = self.run_main("--port", str(occupied.server_port))
        self.assertEqual(result, 1)
        self.assertIn("--auto-port", output)
        open_browser.assert_not_called()


if __name__ == "__main__":
    unittest.main()
