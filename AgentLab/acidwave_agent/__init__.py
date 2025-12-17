"""
Acidwave Agent Package
======================

Web automation agent for Acidwave music player testing.
Based on AgentLab and WebArena architectures.
"""

from .agent import AcidwaveAgentArgs, AcidwaveAgent
from .prompts import ACIDWAVE_SYSTEM_PROMPT, ACIDWAVE_EXAMPLES

__all__ = [
    "AcidwaveAgentArgs",
    "AcidwaveAgent",
    "ACIDWAVE_SYSTEM_PROMPT",
    "ACIDWAVE_EXAMPLES",
]

__version__ = "0.1.0"
