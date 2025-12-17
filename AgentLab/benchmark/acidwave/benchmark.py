"""
Acidwave Benchmark
==================

WebArena-style Benchmark wrapper so AgentLab's GenericAgent can adapt flags
(`is_multi_tab`, `high_level_action_set_args`, dependency graph hooks).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, List, Optional

import pandas as pd
from browsergym.experiments.benchmark.base import Benchmark, HighLevelActionSetArgs

from agentlab.experiments.loop import EnvArgs


class AcidwaveBenchmark(Benchmark):
    """Collection of Acidwave tasks with AgentLab-compatible attributes."""

    def __init__(
        self,
        task_subset: Optional[Iterable[int]] = None,
        difficulty: Optional[str] = None,
        max_steps: int = 30,
        headless: bool = True,
        slow_mo: int = 100,
    ) -> None:
        # Load tasks from JSON (mirrors WebArena's evaluate loader)
        task_file = Path(__file__).parent / "test.raw.json"
        with open(task_file, "r", encoding="utf-8") as f:
            raw_tasks = json.load(f)

        # Normalize task list (dicts, matches WebArena evaluate usage)
        tasks: List[dict] = []
        for t in raw_tasks:
            tasks.append(
                {
                    "task_id": t["task_id"],
                    "intent": t.get("intent", ""),
                    "difficulty": t.get("difficulty", "unknown"),
                    "start_url": t.get("start_url", "http://localhost:5173"),
                    "eval": t.get("eval", {}),
                }
            )

        # Apply filters (task IDs or difficulty)
        if task_subset is not None:
            subset_set = set(task_subset)
            tasks = [t for t in tasks if t["task_id"] in subset_set]

        if difficulty is not None:
            tasks = [t for t in tasks if t["difficulty"].lower() == difficulty.lower()]

        self._tasks: List[dict] = tasks

        # Build default EnvArgs (same fields later customized in run_full_experiments.py)
        env_args_list: List[EnvArgs] = []
        for idx, task in enumerate(self._tasks):
            env_args = EnvArgs(
                task_name=f"acidwave.task_{task['task_id']}",
                task_seed=idx,  # deterministic ordering
                task_kwargs={
                    "start_url": task["start_url"],
                    "goal": task["intent"],
                },
                max_steps=max_steps,
                headless=headless,
                slow_mo=slow_mo,
                viewport={"width": 1280, "height": 720},
                record_video=False,
            )
            env_args_list.append(env_args)

        # Minimal metadata for dependency graph helper (no dependencies column -> assumes none)
        task_metadata = pd.DataFrame(
            [
                {
                    "task_name": f"acidwave.task_{task['task_id']}",
                    "task_id": task["task_id"],
                    "difficulty": task["difficulty"],
                    "intent": task["intent"],
                }
                for task in self._tasks
            ]
        )

        # Define action space for GenericAgent (BID + chat)
        action_set_args = HighLevelActionSetArgs(
            subsets=("bid", "chat"),
            multiaction=False,
            strict=False,
            retry_with_force=False,
        )

        super().__init__(
            name="acidwave",
            high_level_action_set_args=action_set_args,
            is_multi_tab=False,
            supports_parallel_seeds=True,
            env_args_list=env_args_list,
            # Must be one of BrowserGym's known backends; reuse "webarena" but override prepare_backends
            backends=["webarena"],
            task_metadata=task_metadata,
        )

    def __len__(self) -> int:
        return len(self._tasks)

    def __iter__(self):
        return iter(self._tasks)

    def __getitem__(self, idx: int) -> dict:
        return self._tasks[idx]

    def get_tasks_by_difficulty(self, difficulty: str) -> List[dict]:
        """Return raw task dicts filtered by difficulty."""
        return [
            task
            for task in self._tasks
            if task["difficulty"].lower() == difficulty.lower()
        ]

    def prepare_backends(self):
        """
        Override to skip WebArena backend preparation/env var checks.
        Acidwave runs against a single frontend/backend so no extra setup needed.
        """
        return None
