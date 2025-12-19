
import unittest
import sys
import os
import shutil
import zipfile
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add parent directory to path to allow importing task
sys.path.append(os.path.dirname(__file__))

# Import MyDriveTask by file path to bypass package issues
import importlib.util
spec = importlib.util.spec_from_file_location("task", os.path.join(os.path.dirname(__file__), "task.py"))
task_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(task_module)
MyDriveTask = task_module.MyDriveTask

class MockPage:
    def context(self):
        pass
    def inner_text(self, selector):
        return ""

class TestDownloadFileContains(unittest.TestCase):
    def setUp(self):
        self.downloads_dir = Path(__file__).parent.parent.parent / "directory_downloads"
        self.downloads_dir.mkdir(parents=True, exist_ok=True)
        self.dump_path = self.downloads_dir / "agent1_dump.zip"

        # Create a dummy zip file
        with zipfile.ZipFile(self.dump_path, 'w') as zf:
            zf.writestr('target.txt', 'This is a secret message containing foobar.')
            zf.writestr('other.txt', 'Nothing here.')

    def tearDown(self):
        if self.dump_path.exists():
            self.dump_path.unlink()

    @patch('urllib.request.urlopen')
    def test_download_file_contains_success(self, mock_urlopen):
        # Mock 200 response
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # Config for success
        config = {
            "task_id": 999,
            "start_url": "http://localhost:3000",
            "intent": "Test intent",
            "eval": {
                "type": "download_file_contains",
                "agent": "agent1",
                "reference_answers": {
                    "file_path": "target.txt",
                    "must_include": ["secret", "foobar"]
                }
            }
        }
        
        # Patch the config loading in MyDriveTask
        with patch.object(MyDriveTask, '__init__', return_value=None) as mock_init:
             task = MyDriveTask(seed=0, task_id=999)
             task.config = config
             task.start_url = "http://localhost:3000"
             
             # Call validate
             reward, success, msg, info = task.validate(MockPage(), [])
             
             print(f"Result: Reward={reward}, Success={success}, Msg={msg}")
             self.assertEqual(reward, 1.0)
             self.assertTrue(success)
             self.assertIn("Success", msg)

    @patch('urllib.request.urlopen')
    def test_download_file_contains_failure_missing_term(self, mock_urlopen):
        # Mock 200 response
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # Config for failure
        config = {
            "task_id": 999,
            "start_url": "http://localhost:3000",
            "intent": "Test intent",
            "eval": {
                "type": "download_file_contains",
                "agent": "agent1",
                "reference_answers": {
                    "file_path": "target.txt",
                    "must_include": ["secret", "MISSING_TERM"]
                }
            }
        }
        
        # Patch the config loading in MyDriveTask
        with patch.object(MyDriveTask, '__init__', return_value=None) as mock_init:
             task = MyDriveTask(seed=0, task_id=999)
             task.config = config
             task.start_url = "http://localhost:3000"
             
             # Call validate
             reward, success, msg, info = task.validate(MockPage(), [])
             
             print(f"Result: Reward={reward}, Success={success}, Msg={msg}")
             self.assertEqual(reward, 0.0)
             self.assertFalse(success)
             self.assertIn("Missing terms", msg)
             self.assertIn("MISSING_TERM", msg)

if __name__ == '__main__':
    unittest.main()
