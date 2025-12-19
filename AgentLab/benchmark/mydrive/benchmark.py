"""
MyDrive Benchmark
==================

Benchmark wrapper for MyDrive tasks.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable, List, Optional

import pandas as pd
from browsergym.experiments.benchmark.base import Benchmark, HighLevelActionSetArgs

from agentlab.experiments.loop import EnvArgs


class MyDriveBenchmark(Benchmark):
    """Collection of MyDrive tasks with AgentLab-compatible attributes."""

    def __init__(
        self,
        task_subset: Optional[Iterable[int]] = None,
        max_steps: int = 30,
        headless: bool = True,
        slow_mo: int = 100,
        task_file: str = "test.raw.json",
        viewport: dict = None,
    ) -> None:
        if viewport is None:
            viewport = {"width": 1280, "height": 720}
        
        # Load tasks from JSON
        task_file = Path(__file__).parent / task_file
        with open(task_file, "r", encoding="utf-8") as f:
            raw_tasks = json.load(f)

        # Normalize task list
        tasks: List[dict] = []
        for t in raw_tasks:
            tasks.append(
                {
                    "task_id": t["task_id"],
                    "intent": t.get("intent", ""),
                    "start_url": t.get("start_url", os.environ.get("MYDRIVE_BASE_URL", "http://localhost:3000")),
                    "eval": t.get("eval", {}),
                }
            )

        # Apply filters
        if task_subset is not None:
            subset_set = set(task_subset)
            tasks = [t for t in tasks if t["task_id"] in subset_set]

        self._tasks: List[dict] = tasks

        # Build default EnvArgs
        env_args_list: List[EnvArgs] = []
        for idx, task in enumerate(self._tasks):
            env_args = EnvArgs(
                task_name=f"mydrive.task_{task['task_id']}",
                task_seed=idx,
                task_kwargs={
                    # "task_id" is already frozen in register_task
                },
                max_steps=max_steps,
                headless=headless,
                slow_mo=slow_mo,
                viewport=viewport,
                record_video=False,
            )
            env_args_list.append(env_args)

        # Minimal metadata
        task_metadata = pd.DataFrame(
            [
                {
                    "task_name": f"mydrive.task_{task['task_id']}",
                    "task_id": task["task_id"],
                    "intent": task["intent"],
                }
                for task in self._tasks
            ]
        )

        # Define action space for GenericAgent
        action_set_args = HighLevelActionSetArgs(
            subsets=("bid", "chat"),
            multiaction=False,
            strict=False,
            retry_with_force=False,
        )

        super().__init__(
            name="mydrive",
            high_level_action_set_args=action_set_args,
            is_multi_tab=False,
            supports_parallel_seeds=True,
            env_args_list=env_args_list,
            backends=["webarena"], # Reuse generic backend
            task_metadata=task_metadata,
        )

    def __len__(self) -> int:
        return len(self._tasks)

    def __iter__(self):
        return iter(self._tasks)

    def __getitem__(self, idx: int) -> dict:
        return self._tasks[idx]

    def prepare_backends(self):
        return None
