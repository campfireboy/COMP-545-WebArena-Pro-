"""
Acidwave Task Implementation
=============================

Defines the task class for Acidwave benchmark.
Based on BrowserGym's AbstractBrowserTask.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional
import playwright.sync_api

from browsergym.core.task import AbstractBrowserTask

logger = logging.getLogger(__name__)


# CRITICAL: Auto-register all Acidwave tasks when this module is imported
# This ensures tasks are available even in Ray workers
def _ensure_tasks_registered():
    """Ensure all Acidwave tasks are registered with Gymnasium."""
    try:
        import gymnasium as gym
        from browsergym.core.registration import register_task
        
        # Check if tasks are already registered
        registry = gym.envs.registry
        acidwave_tasks = [env_id for env_id in registry if 'acidwave' in env_id]
        
        if acidwave_tasks:
            # Tasks already registered
            #logger.debug(f"[task.py] Acidwave tasks already registered ({len(acidwave_tasks)} tasks)")
            return
        
        # Load and register all tasks
        task_file = Path(__file__).parent / "test.raw.json"
        with open(task_file, 'r', encoding='utf-8') as f:
            all_tasks = json.load(f)
        
        for task_config in all_tasks:
            task_id = task_config["task_id"]
            gym_id = f"acidwave.task_{task_id}"
            
            # Register with BrowserGym (will be idempotent due to Gymnasium)
            try:
                register_task(
                    gym_id,
                    "benchmark.acidwave.task:AcidwaveTask",  # Use string to avoid circular import
                    task_kwargs={
                        "task_id": task_id,
                    },
                )
            except Exception:
                pass  # Task might already be registered
        
        #print(f"[task.py] Registered {len(all_tasks)} Acidwave tasks in PID {os.getpid()}")
        
    except Exception as e:
        logger.warning(f"[task.py] Failed to auto-register tasks: {e}")


# Auto-register tasks on module import
_ensure_tasks_registered()


class AcidwaveTask(AbstractBrowserTask):
    """
    Acidwave music player task implementation.

    Each task corresponds to a specific music player interaction defined
    in test.raw.json.

    Example:
        >>> task = AcidwaveTask(seed=42, task_id=0)
        >>> goal, info = task.setup(page)
        >>> # Task ready to run
    """

    def __init__(
        self,
        seed: int,
        task_id: int,
        start_url: str = "http://localhost:5173",
        goal: Optional[str] = None,
    ) -> None:
        """
        Initialize Acidwave task.

        Args:
            seed: Random seed for reproducibility
            task_id: Task ID from test.raw.json
            start_url: URL of Acidwave frontend (default: http://localhost:5173)
            goal: Task goal/intent (loaded from test.raw.json if None)
        """
        super().__init__(seed)

        # Task configuration
        self.task_id = task_id
        self.start_url = start_url
        self._goal = goal

        # Browser configuration
        self.viewport = {"width": 1280, "height": 720}
        self.slow_mo = 100  # ms - slower for UI interactions
        self.timeout = 10000  # ms

        # Load task configuration from test.raw.json
        task_file = Path(__file__).parent / "test.raw.json"
        with open(task_file, 'r', encoding='utf-8') as f:
            all_tasks = json.load(f)

        # Find this task's config
        self.config = None
        for task_config in all_tasks:
            if task_config["task_id"] == task_id:
                self.config = task_config
                break

        if self.config is None:
            raise ValueError(f"Task ID {task_id} not found in test.raw.json")

        # Override goal if provided in config
        if self._goal is None:
            self._goal = self.config["intent"]

        logger.info(f"Initialized Acidwave task {task_id}: {self._goal[:60]}...")

    def setup(self, page: playwright.sync_api.Page) -> tuple[str, dict]:
        """
        Set up the task environment.

        This method is called before the agent starts interacting with the page.
        It navigates to the starting URL and returns the goal.

        Args:
            page: Playwright page object

        Returns:
            Tuple of (goal string, info dict)
        """
        # Navigate to Acidwave
        logger.info(f"Navigating to {self.start_url}")
        page.goto(self.start_url, wait_until="domcontentloaded")

        # Wait for app to load (look for navigation elements)
        try:
            page.wait_for_selector('[role="button"]', timeout=5000)
            logger.info("Acidwave app loaded successfully")
        except Exception as e:
            logger.warning(f"Acidwave may not have loaded properly: {e}")

        # Return goal and metadata
        return self._goal, {
            "task_id": self.task_id,
            "difficulty": self.config.get("difficulty", "unknown"),
            "start_url": self.start_url,
        }

    def teardown(self) -> None:
        """
        Clean up after task completion.

        For Acidwave, no special cleanup is needed since each task
        starts fresh from the homepage.
        """
        logger.info(f"Task {self.task_id} teardown complete")

    def validate(
        self,
        page: playwright.sync_api.Page,
        chat_messages: list[dict],
    ) -> tuple[float, bool, str, dict]:
        """
        Validate task completion and calculate reward.
        
        Implements WebArena-style evaluation with multiple eval types:
        - string_match: Check for text in page
        - program_html: Check for HTML elements and states
        - url_match: Check URL patterns
        - element_state: Check element visibility/attributes
        - element_changed: Check if elements changed

        Args:
            page: Playwright page object with final state
            chat_messages: List of agent-environment interaction messages

        Returns:
            Tuple of (reward, done, message, info_dict)
        """
        eval_config = self.config.get("eval", {})
        eval_types = eval_config.get("eval_types", [])
        reference = eval_config.get("reference_answers", {})
        program_html = eval_config.get("program_html", [])

        # Get current page content
        try:
            page_text = page.inner_text("body")
            page_html = page.content()
            page_url = page.url
        except Exception as e:
            logger.error(f"Error getting page content: {e}")
            return 0.0, True, f"Error: {e}", {}

        # Track validation details
        checks_passed = []
        checks_failed = []
        
        # Initialize validation result
        reward = 0.0
        success = False
        message = "Task not completed"
        
        # Track individual evaluation scores
        string_match_score = 0.0
        html_check_score = 0.0
        url_match_score = 0.0

        # ==========================================
        # EVALUATION TYPE 1: String Match
        # ==========================================
        if "string_match" in eval_types:
            exact_match = reference.get("exact_match", "")
            must_include = reference.get("must_include", [])
            must_exclude = reference.get("must_exclude", [])

            # Check exact match
            exact_found = True
            if exact_match:
                exact_found = exact_match in page_text
                if exact_found:
                    checks_passed.append(f"Found exact: '{exact_match}'")
                else:
                    checks_failed.append(f"Missing exact: '{exact_match}'")

            # Check must include
            all_includes = True
            for term in must_include:
                if term in page_text:
                    checks_passed.append(f"Found required: '{term}'")
                else:
                    checks_failed.append(f"Missing required: '{term}'")
                    all_includes = False

            # Check must exclude
            no_excludes = True
            for term in must_exclude:
                if term not in page_text:
                    checks_passed.append(f"Correctly excluded: '{term}'")
                else:
                    checks_failed.append(f"Found excluded term: '{term}'")
                    no_excludes = False

            # Calculate string match score
            if exact_found and all_includes and no_excludes:
                string_match_score = 1.0
                success = True
            else:
                # Partial credit
                partial_score = 0.0
                if exact_found:
                    partial_score += 0.4
                if all_includes:
                    partial_score += 0.4
                if no_excludes:
                    partial_score += 0.2
                string_match_score = partial_score

        # ==========================================
        # EVALUATION TYPE 2: Program HTML
        # ==========================================
        if "program_html" in eval_types and program_html:
            html_checks = []
            
            for check_config in program_html:
                locator_str = check_config.get("locator", "")
                required_state = check_config.get("required_state", None)
                required_contents = check_config.get("required_contents", None)
                attribute = check_config.get("attribute", None)
                required_range = check_config.get("required_range", None)
                check_type = check_config.get("check", None)
                
                try:
                    # Find element(s)
                    locator = page.locator(locator_str)
                    element_count = locator.count()
                    
                    if element_count == 0:
                        checks_failed.append(f"Element not found: {locator_str}")
                        html_checks.append(False)
                        continue
                    
                    # Get first matching element
                    element = locator.first
                    
                    # Check 1: Visibility state
                    if required_state == "visible":
                        is_visible = element.is_visible()
                        if is_visible:
                            checks_passed.append(f"Element visible: {locator_str}")
                            html_checks.append(True)
                        else:
                            checks_failed.append(f"Element not visible: {locator_str}")
                            html_checks.append(False)
                        continue
                    
                    # Check 2: Element attribute
                    if attribute:
                        attr_value = element.get_attribute(attribute)
                        
                        # Check if attribute contains required content
                        if required_contents:
                            if attr_value and required_contents.lower() in attr_value.lower():
                                checks_passed.append(
                                    f"Attribute '{attribute}' contains '{required_contents}'"
                                )
                                html_checks.append(True)
                            else:
                                checks_failed.append(
                                    f"Attribute '{attribute}' missing '{required_contents}' (got: {attr_value})"
                                )
                                html_checks.append(False)
                            continue
                        
                        # Check if attribute in range
                        if required_range:
                            try:
                                value = float(attr_value or 0)
                                min_val, max_val = required_range
                                if min_val <= value <= max_val:
                                    checks_passed.append(
                                        f"Attribute '{attribute}' in range [{min_val}, {max_val}]: {value}"
                                    )
                                    html_checks.append(True)
                                else:
                                    checks_failed.append(
                                        f"Attribute '{attribute}' out of range (got: {value})"
                                    )
                                    html_checks.append(False)
                            except ValueError:
                                checks_failed.append(
                                    f"Attribute '{attribute}' not numeric: {attr_value}"
                                )
                                html_checks.append(False)
                            continue
                    
                    # Check 3: Element text content
                    if required_contents and not attribute:
                        text_content = element.inner_text()
                        if required_contents.lower() in text_content.lower():
                            checks_passed.append(f"Element contains: '{required_contents}'")
                            html_checks.append(True)
                        else:
                            checks_failed.append(
                                f"Element missing text: '{required_contents}' (got: {text_content[:50]})"
                            )
                            html_checks.append(False)
                        continue
                    
                    # Check 4: Element changed (for dynamic content)
                    if check_type == "text_changed":
                        # This is tricky - we need to compare with initial state
                        # For now, just check if element has non-empty text
                        text_content = element.inner_text()
                        if text_content and len(text_content.strip()) > 0:
                            checks_passed.append(f"Element has content: {locator_str}")
                            html_checks.append(True)
                        else:
                            checks_failed.append(f"Element empty: {locator_str}")
                            html_checks.append(False)
                        continue
                    
                    # Default: element exists
                    checks_passed.append(f"Element exists: {locator_str}")
                    html_checks.append(True)
                    
                except Exception as e:
                    logger.warning(f"Error checking element '{locator_str}': {e}")
                    checks_failed.append(f"Error checking: {locator_str}")
                    html_checks.append(False)
            
            # Calculate HTML check score
            if html_checks:
                html_success_rate = sum(html_checks) / len(html_checks)
                if html_success_rate == 1.0:
                    # 所有HTML检查都通过
                    html_check_score = 1.0
                    success = True
                elif html_success_rate >= 0.8:
                    # 大部分通过，给予较高分数但不算完全成功
                    html_check_score = html_success_rate * 0.85
                else:
                    # 通过率低，给予较低分数
                    html_check_score = html_success_rate * 0.6

        # ==========================================
        # EVALUATION TYPE 3: URL Match
        # ==========================================
        if "url_match" in eval_types:
            import re
            # Support both url_pattern (regex) and exact_match (exact URL)
            url_pattern = reference.get("url_pattern", "")
            exact_url = reference.get("exact_match", "")
            
            if url_pattern:
                # Use regex pattern matching
                if re.search(url_pattern, page_url):
                    checks_passed.append(f"URL matches pattern: {url_pattern}")
                    url_match_score = 1.0
                else:
                    checks_failed.append(f"URL doesn't match pattern: {url_pattern} (got: {page_url})")
                    url_match_score = 0.0
            elif exact_url:
                # Use exact URL matching
                if page_url == exact_url:
                    checks_passed.append(f"URL matches exactly: {exact_url}")
                    url_match_score = 1.0
                else:
                    checks_failed.append(f"URL doesn't match: expected '{exact_url}', got '{page_url}'")
                    url_match_score = 0.0
            else:
                checks_failed.append("No URL pattern or exact match specified in eval config")
                url_match_score = 0.0

        # ==========================================
        # EVALUATION TYPE 4: Element State
        # ==========================================
        if "element_state" in eval_types and program_html:
            # Similar to program_html but focuses on state
            # (Already handled in program_html section above)
            pass

        # ==========================================
        # CALCULATE FINAL REWARD
        # ==========================================
        # 如果任务使用多种评估类型，需要综合考虑所有类型的得分
        # 策略：取所有有效评估类型的最小值（AND逻辑），确保所有条件都满足
        
        active_scores = []
        if "string_match" in eval_types:
            active_scores.append(string_match_score)
        if "program_html" in eval_types and program_html:
            active_scores.append(html_check_score)
        if "url_match" in eval_types:
            active_scores.append(url_match_score)
        
        if active_scores:
            # 使用最小值策略：所有评估都必须通过
            reward = min(active_scores)
            # 如果所有评估类型都接近完美，才算成功
            success = all(score >= 0.95 for score in active_scores)
        else:
            # 没有有效评估，使用启发式
            reward = 0.0
        
        # ==========================================
        # DEFAULT: Heuristic Check
        # ==========================================
        if not eval_types or (reward == 0.0 and not active_scores):
            logger.warning(f"No evaluation type or checks failed for task {self.task_id}")
            # Check if goal keywords are present
            goal_keywords = self._goal.lower().split()
            found_keywords = sum(1 for kw in goal_keywords if kw in page_text.lower())
            reward = min(1.0, found_keywords / max(len(goal_keywords), 1))
            success = reward > 0.7
            message = f"Heuristic evaluation: {found_keywords}/{len(goal_keywords)} keywords found"
        
        # ==========================================
        # Build Final Message
        # ==========================================
        # 评估策略：需要所有检查都通过才算成功
        
        if reward >= 0.98:
            # 几乎完美完成
            success = True
            done = True
            message = "✅ Task completed successfully"
        elif reward >= 0.9:
            # 所有关键检查通过，允许微小误差
            success = True
            done = True
            message = f"✅ Task completed (score: {reward:.2f})"
        elif reward >= 0.7:
            # 大部分完成但不够完美，继续尝试
            success = False
            done = False
            message = f"⚠️  Task mostly completed (score: {reward:.2f}), but not all checks passed. Continue..."
        elif reward > 0:
            # 部分完成，继续尝试
            success = False
            done = False
            message = f"⚠️  Task in progress (score: {reward:.2f}), {len(checks_passed)}/{len(checks_passed) + len(checks_failed)} checks passed. Continue..."
        else:
            # 完全失败，继续尝试（除非超过max_steps）
            success = False
            done = False
            message = f"❌ Task not completed (score: {reward:.2f}). Keep trying..."

        # Add check details to message
        if checks_passed or checks_failed:
            message += f"\n   Passed: {len(checks_passed)}, Failed: {len(checks_failed)}"
            if checks_failed and len(checks_failed) <= 3:
                message += f"\n   Issues: {'; '.join(checks_failed)}"

        logger.info(f"Task {self.task_id} validation: reward={reward:.2f}, done={done}, success={success}")
        logger.debug(f"Passed checks: {checks_passed}")
        logger.debug(f"Failed checks: {checks_failed}")
        
        return reward, done, message, {
            "reward": reward,
            "success": success,
            "task_id": self.task_id,
            "checks_passed": checks_passed,
            "checks_failed": checks_failed,
            "page_url": page_url,
        }

    def cheat(self, page: playwright.sync_api.Page, chat_messages: list[str]) -> None:
        """
        Provide a hint or solution for debugging.

        This is used for development and debugging purposes.
        """
        raise NotImplementedError("Cheat mode not implemented for Acidwave tasks")

    @classmethod
    def get_task_id(cls):
        """
        Get the task ID for this task class.

        Note: AcidwaveTask is a generic class that can handle multiple task IDs,
        so this method is not applicable.
        """
        raise NotImplementedError("AcidwaveTask handles multiple task IDs")
