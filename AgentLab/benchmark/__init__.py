"""
Benchmark package for Acidwave tasks.

Importing this module registers all Acidwave tasks so AgentLab and BrowserGym
can discover them when creating environments (mirrors WebArena's registration
pattern).
"""

from .acidwave import *  # noqa: F401,F403
