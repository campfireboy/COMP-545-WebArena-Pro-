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
import urllib.parse
from urllib.parse import urljoin

from browsergym.core.task import AbstractBrowserTask

logger = logging.getLogger(__name__)

# CRITICAL: Auto-register all MyDrive tasks when this module is imported
def _ensure_tasks_registered():
    """Ensure all MyDrive tasks are registered with Gymnasium."""
    try:
        import gymnasium as gym
        from browsergym.core.registration import register_task
        
        # Load tasks from both regular and composite task files
        task_files = ["test.raw.json", "test_composite.raw.json"]
        
        for task_filename in task_files:
            task_file = Path(__file__).parent / task_filename
            if not task_file.exists():
                continue
                
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
        sub_task_id: Optional[int] = None,
    ) -> None:
        super().__init__(seed)

        # Load config
        task_file = Path(__file__).parent / "test.raw.json"
        with open(task_file, 'r', encoding='utf-8') as f:
            all_tasks = json.load(f)
            
        self.all_tasks_map = {t["task_id"]: t for t in all_tasks}
        self.config = self.all_tasks_map.get(task_id)
        if not self.config:
            raise ValueError(f"Task ID {task_id} not found")

        # Handle Composite Sub-Tasks
        self.sub_task_id = sub_task_id
        if self.sub_task_id is not None:
            if "eval" not in self.config or "sub_tasks" not in self.config["eval"]:
                raise ValueError(f"Task {task_id} is not a composite task but sub_task_id {sub_task_id} was provided")
            
            try:
                # Override config with the sub-task config
                # We merge relevant fields but primarily respect the sub-task's intent/eval
                sub_config = self.config["eval"]["sub_tasks"][self.sub_task_id]
                self.config = sub_config
                # Ensure task_id remains the parent's for uniqueness or tracking if needed? 
                # Actually, BrowserGym needs unique task names usually, but we are inside one Gym Env.
                # Just overriding self.config is enough for our logic below to pick up "intent" and "eval".
            except IndexError:
                raise ValueError(f"Sub-task ID {sub_task_id} out of range for Task {task_id}")

        # Determine start_url priority:
        if start_url:
            self.start_url = start_url
        elif self.config.get("start_url"):
            self.start_url = self.config["start_url"]
        else:
            self.start_url = os.environ.get("MYDRIVE_BASE_URL", "http://localhost:3000/login")
            
        self.task_id = task_id
        self.viewport = {"width": 1280, "height": 720}
        self.slow_mo = 500
        self._goal = goal

        if self._goal is None:
            self._goal = self.config["intent"]

    def setup(self, page: playwright.sync_api.Page) -> tuple[str, dict]:
        # Clear cookies to ensure fresh session
        logger.info("Clearing browser cookies")
        page.context.clear_cookies()

        # Reset database
        reset_url = urljoin(self.start_url, "/api/dev/reset")
        try:
            logger.info(f"Resetting database via {reset_url}")
            req = urllib.request.Request(reset_url, method="POST")
            with urllib.request.urlopen(req) as response:
                resp_body = response.read().decode('utf-8')
                logger.info(f"Reset Response: {resp_body}")
                if response.status != 200:
                    logger.warning(f"Database reset failed with status {response.status}")
        except Exception as e:
            logger.warning(f"Failed to reset database: {e}")

        # Authenticate via auto-login page IF not starting at login
        # For composite/sub-tasks, "composite" check might still fail if we swapped config.
        # But we WANT it to run for sub-tasks.
        # If config is now a sub-task config, it won't have "eval": {"type": "composite"} anymore.
        # It will resolve to "string_match" or similar.
        if "/login" not in self.start_url and ("eval" not in self.config or "composite" not in str(self.config["eval"].get("type", ""))):
            # Determine agent credentials
            agent_name = "agent1"
            
            # Check top-level 'agent' (used in sub-tasks)
            if "agent" in self.config:
                agent_name = self.config["agent"]
            # Check eval-level 'agent' (legacy/standard)
            elif "eval" in self.config and "agent" in self.config["eval"]:
                agent_name = self.config["eval"]["agent"]
            
            try:
                # Extract number from agent name (agent1 -> 1)
                agent_num = "".join(filter(str.isdigit, agent_name))
                if not agent_num:
                     agent_num = "1"
            except Exception:
                 agent_name = "agent1"
            
            auth_url = urljoin(self.start_url, f"/{agent_name}-login")
            
            logger.info(f"Authenticating via {auth_url}")
            page.goto(auth_url)
            
            try:
                # Timeout reduced to 7s as requested
                page.wait_for_url(lambda u: u.rstrip('/') == self.start_url.rstrip('/'), timeout=7000)
                logger.info("Authentication successful (redirected to root)")
            except Exception as e:
                logger.warning(f"Auth redirect timed out (>7s) or failed: {e}")

        # Ensure we are on the start page (home)
        logger.info(f"Navigating to {self.start_url}")
        page.goto(self.start_url, wait_until="domcontentloaded")

        return self._goal, {"task_id": self.task_id}

    def teardown(self) -> None:
        pass

    def validate(
        self,
        page: playwright.sync_api.Page,
        chat_messages: list[dict],
    ) -> tuple[float, bool, str, dict]:
        return self._validate_config(self.config.get("eval", {}), page)

    def _validate_config(self, eval_config: dict, page: playwright.sync_api.Page) -> tuple[float, bool, str, dict]:
        eval_type = eval_config.get("type", "string_match")
        
        if eval_type == "composite":
            return self._validate_composite(eval_config, page)
            
        if eval_type == "string_match":
            return self._validate_string_match(eval_config, page)
            
        if eval_type == "downloadsmatch":
             return self._validate_downloads_match(eval_config, page)

        if eval_type == "download_file_contains":
             return self._validate_file_contains(eval_config, page)
             
        return 0.0, False, f"Unknown eval type: {eval_type}", {}

    def _validate_composite(self, eval_config: dict, page: playwright.sync_api.Page) -> tuple[float, bool, str, dict]:
        sub_tasks = eval_config.get("sub_tasks", [])
        operator = eval_config.get("operator", "AND").upper()
        
        results = []
        messages = []
        
        for i, sub_task_config in enumerate(sub_tasks):
            # sub_task_config is now the full config dict (intent, eval, etc) or just the eval part?
            # User said "two task litterally". 
            # I'll assume it's the Full Task Config (like in test.raw.json) or at least contains 'eval'.
            # If it's just eval config, that's fine too. 
            # But usually tasks have "intent" too.
            # Let's support both: if it has "eval" key, use it. Else assume it IS the eval config.
            
            sub_eval = sub_task_config.get("eval", sub_task_config)
            
            # Recursive validation
            _, success, msg, _ = self._validate_config(sub_eval, page)
            results.append(success)
            messages.append(f"Subtask {i+1}: {'Pass' if success else 'Fail'} ({msg})")

        success = False
        if operator == "AND":
            success = all(results)
        elif operator == "OR":
            success = any(results)
        else:
            return 0.0, False, f"Unknown operator {operator}", {}

        reward = 1.0 if success else 0.0
        return reward, success, f"Composite {operator} Result: {success}. Details: {'; '.join(messages)}", {}

    def _validate_string_match(self, eval_config: dict, page: playwright.sync_api.Page) -> tuple[float, bool, str, dict]:
        reference = eval_config.get("reference_answers", {})
        must_include = reference.get("must_include", [])
        text = page.inner_text("body")

        if must_include:
            if all(term in text for term in must_include):
                return 1.0, True, "Success: Found required text", {}
            else:
                return 0.0, False, f"Missing terms: {[t for t in must_include if t not in text]}", {}
        return 1.0, True, "No terms required", {}

    def _validate_downloads_match(self, eval_config: dict, page: playwright.sync_api.Page) -> tuple[float, bool, str, dict]:
        agent_name = eval_config.get("agent", "agent1")
        dump_url = urljoin(self.start_url, f"/api/dev/dump?agent={agent_name}")
        
        try:
            req = urllib.request.Request(dump_url, method="POST")
            with urllib.request.urlopen(req) as response:
                    if response.status != 200:
                        return 0.0, False, f"Dump failed: {response.status}", {}
        except Exception as e:
                return 0.0, False, f"Dump trigger error: {e}", {}

        base_dir = Path(__file__).parent.parent.parent / "directory_downloads"
        dump_dir = base_dir / f"{agent_name}_dump"

        if not dump_dir.exists():
            return 0.0, False, f"Dump directory not found at {dump_dir}", {}

        try:
            reference = eval_config.get("reference_answers", {})
            dir1_rel = reference.get("directory_1") 
            dir2_ref = reference.get("directory_2")
            
            if not dir1_rel or not dir2_ref:
                    return 0.0, False, "Missing directory_1 or directory_2 in config", {}

            dir1_path = dump_dir / dir1_rel
            
            if not dir1_path.exists():
                    return 0.0, False, f"Directory 1 not found in dump: {dir1_rel}", {}
            
            dir1_files = set(f.name for f in dir1_path.iterdir())
            
            dir2_files = set()
            if isinstance(dir2_ref, list):
                dir2_files = set(dir2_ref)
            else:
                dir2_path = dump_dir / dir2_ref
                if not dir2_path.exists():
                        return 0.0, False, f"Directory 2 not found in dump: {dir2_ref}", {}
                dir2_files = set(f.name for f in dir2_path.iterdir())
            
            if dir1_files == dir2_files:
                return 1.0, True, f"Success: Directory contents match ({len(dir1_files)} items)", {}
            else:
                missing = dir2_files - dir1_files
                extra = dir1_files - dir2_files
                return 0.0, False, f"Mismatch: Missing {missing}, Extra {extra}", {}
        except Exception as e:
            return 0.0, False, f"Comparison error: {e}", {}

    def _validate_file_contains(self, eval_config: dict, page: playwright.sync_api.Page) -> tuple[float, bool, str, dict]:
        agent_name = eval_config.get("agent", "agent1")
        dump_url = urljoin(self.start_url, f"/api/dev/dump?agent={agent_name}")
        
        try:
            req = urllib.request.Request(dump_url, method="POST")
            with urllib.request.urlopen(req) as response:
                    if response.status != 200:
                        return 0.0, False, f"Dump failed: {response.status}", {}
        except Exception as e:
                logger.error(f"Dump trigger error: {e}")
                return 0.0, False, f"Dump trigger error: {e}", {}

        base_dir = Path(__file__).parent.parent.parent / "directory_downloads"
        dump_dir = base_dir / f"{agent_name}_dump"

        if not dump_dir.exists():
            return 0.0, False, f"Dump directory not found at {dump_dir}", {}

        try:
            reference = eval_config.get("reference_answers", {})
            file_rel = reference.get("file_path") 
            must_include = reference.get("must_include", [])
            
            if not file_rel:
                    return 0.0, False, "Missing file_path in config", {}

            file_path = dump_dir / file_rel
            
            if not file_path.exists():
                    return 0.0, False, f"File not found in dump: {file_rel}", {}
            
            try:
                content = file_path.read_text(encoding='utf-8')
            except UnicodeDecodeError:
                return 0.0, False, f"Could not read file {file_rel} as utf-8", {}

            missing = [term for term in must_include if term not in content]
            
            if not missing:
                return 1.0, True, f"Success: Found all {len(must_include)} terms in {file_rel}", {}
            else:
                return 0.0, False, f"Mismatch: Missing terms {missing} in {file_rel}", {}
        except Exception as e:
            return 0.0, False, f"Content check error: {e}", {}

_ensure_tasks_registered()
