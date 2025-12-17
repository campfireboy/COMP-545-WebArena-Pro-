"""
MyDrive Task Implementation
=============================

Defines the task class for MyDrive benchmark.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional
import playwright.sync_api
import urllib.request
import urllib.error
from urllib.parse import urljoin

from browsergym.core.task import AbstractBrowserTask

logger = logging.getLogger(__name__)

# CRITICAL: Auto-register all MyDrive tasks when this module is imported
def _ensure_tasks_registered():
    """Ensure all MyDrive tasks are registered with Gymnasium."""
    try:
        import gymnasium as gym
        from browsergym.core.registration import register_task
        
        # Load tasks
        task_file = Path(__file__).parent / "test.raw.json"
        if not task_file.exists():
            return
            
        with open(task_file, 'r', encoding='utf-8') as f:
            all_tasks = json.load(f)
        
        for task_config in all_tasks:
            task_id = task_config["task_id"]
            gym_id = f"mydrive.task_{task_id}"
            
            # Register with BrowserGym
            try:
                register_task(
                    gym_id,
                    MyDriveTask,
                    task_kwargs={
                        "task_id": task_id,
                    },
                )
            except Exception:
                pass
        
    except Exception as e:
        logger.warning(f"[mydrive/task.py] Failed to auto-register tasks: {e}")

class MyDriveTask(AbstractBrowserTask):
    """
    MyDrive task implementation.
    """

    def __init__(
        self,
        seed: int,
        task_id: int,
        start_url: Optional[str] = None,
        goal: Optional[str] = None,
    ) -> None:
        super().__init__(seed)

        # Load config
        task_file = Path(__file__).parent / "test.raw.json"
        with open(task_file, 'r', encoding='utf-8') as f:
            all_tasks = json.load(f)
            
        self.config = next((t for t in all_tasks if t["task_id"] == task_id), None)
        if not self.config:
            raise ValueError(f"Task ID {task_id} not found")

        # Determine start_url priority:
        # 1. Constructor argument (if provided)
        # 2. Config 'start_url' (if present in JSON)
        # 3. Environment variable 'MYDRIVE_BASE_URL'
        # 4. Default localhost:3000
        if start_url:
            self.start_url = start_url
        elif self.config.get("start_url"):
            self.start_url = self.config["start_url"]
        else:
            self.start_url = os.environ.get("MYDRIVE_BASE_URL", "http://localhost:3000")
            
        self.task_id = task_id
        self.viewport = {"width": 1280, "height": 720}
        self.slow_mo = 100
        self._goal = goal

        if self._goal is None:
            self._goal = self.config["intent"]

    def setup(self, page: playwright.sync_api.Page) -> tuple[str, dict]:
        # Reset database
        reset_url = urljoin(self.start_url, "/api/dev/reset")
        try:
            logger.info(f"Resetting database via {reset_url}")
            req = urllib.request.Request(reset_url, method="POST")
            with urllib.request.urlopen(req) as response:
                if response.status != 200:
                    logger.warning(f"Database reset failed with status {response.status}")
        except Exception as e:
            logger.warning(f"Failed to reset database: {e}")

        # Authenticate via auto-login page
        auth_url = urljoin(self.start_url, "/agent-login")
        logger.info(f"Authenticating via {auth_url}")
        page.goto(auth_url)
        
        # Wait for redirect to main page (indicated by URL being base or /drive)
        # We give it a generous timeout to allow for potential compilation/cold start
        try:
            page.wait_for_url(lambda u: u.rstrip('/') == self.start_url.rstrip('/'), timeout=15000)
            logger.info("Authentication successful (redirected to root)")
        except Exception as e:
            logger.warning(f"Auth redirect timed out or failed: {e}")

        # Ensure we are on the start page (home)
        logger.info(f"Navigating to {self.start_url}")
        page.goto(self.start_url, wait_until="domcontentloaded")

        # Now at goal url (hopefully)
        return self._goal, {"task_id": self.task_id}

    def teardown(self) -> None:
        pass

    def validate(
        self,
        page: playwright.sync_api.Page,
        chat_messages: list[dict],
    ) -> tuple[float, bool, str, dict]:
        # Reuse logic similar to acidwave or simplify
        # For MVP, just return heuristic success if goal string in page content
        # Real implementation should use eval config
        
        content = page.content()
        text = page.inner_text("body")
        
        reward = 0.0
        success = False
        message = "Task failed"

        # Simple string matching based on config
        eval_config = self.config.get("eval", {})
        reference = eval_config.get("reference_answers", {})
        must_include = reference.get("must_include", [])
        
        if must_include:
            if all(term in text for term in must_include):
                reward = 1.0
                success = True
                message = "Success: Found required text"
            else:
                message = f"Missing terms: {[t for t in must_include if t not in text]}"
        
        return reward, success, message, {}

_ensure_tasks_registered()
