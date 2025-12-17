"""
Acidwave Benchmark Package
===========================

Registers all Acidwave tasks with BrowserGym.

Import this module to automatically register all tasks:
    >>> from benchmark.acidwave import AcidwaveBenchmark
    >>> # All tasks are now registered with Gymnasium
"""

import json
from pathlib import Path
from browsergym.core.registration import register_task
from .task import AcidwaveTask
from .benchmark import AcidwaveBenchmark

# Load all task IDs from test.raw.json
_task_file = Path(__file__).parent / "test.raw.json"
with open(_task_file, 'r', encoding='utf-8') as f:
    _all_tasks = json.load(f)

ALL_ACIDWAVE_TASK_IDS = []

# Register each task as a Gymnasium environment
for task_config in _all_tasks:
    task_id = task_config["task_id"]
    gym_id = f"acidwave.task_{task_id}"

    # Register with BrowserGym
    # Note: Only pass task_id as frozen parameter
    # start_url and goal will be passed at environment creation time
    register_task(
        gym_id,
        AcidwaveTask,
        task_kwargs={
            "task_id": task_id,
        },
    )

    ALL_ACIDWAVE_TASK_IDS.append(gym_id)

print(f"[OK] Registered {len(ALL_ACIDWAVE_TASK_IDS)} Acidwave tasks: {ALL_ACIDWAVE_TASK_IDS[:3]}...")

# Export public API
__all__ = [
    "AcidwaveTask",
    "AcidwaveBenchmark",
    "ALL_ACIDWAVE_TASK_IDS",
]
