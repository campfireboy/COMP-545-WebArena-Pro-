"""
Acidwave Agents Package
=======================

CRITICAL: This __init__.py ensures Acidwave tasks are registered
whenever the agents package is imported, including in Ray workers.
"""

# CRITICAL: Import patch first to modify AgentLab's _get_env_name
# This must happen BEFORE any BrowserGym tasks are created
#import patch_agentlab  # Force patching in ALL processes (main + Ray workers)

# Force registration of Acidwave tasks
# This runs whenever ANY module from agents is imported
import benchmark.acidwave

#print(f"[agents.__init__] Registered {len(benchmark.acidwave.ALL_ACIDWAVE_TASK_IDS)} Acidwave tasks in process")

# Export agents
from .acidwave_agent import (
    ACIDWAVE_AGENT,
    ACIDWAVE_REASONING_AGENT,
    ACIDWAVE_FAST_AGENT,
    AcidwaveAgentArgs,
)

__all__ = [
    "ACIDWAVE_AGENT",
    "ACIDWAVE_REASONING_AGENT",
    "ACIDWAVE_FAST_AGENT",
    "AcidwaveAgentArgs",
]
