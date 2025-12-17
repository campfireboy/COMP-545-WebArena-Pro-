"""
Acidwave Agent Implementation
==============================

Agent implementation following AgentLab's pattern and WebArena's architecture.

Based on:
- AgentLab's MostBasicAgent (https://github.com/ServiceNow/AgentLab)
- WebArena's PromptAgent (https://github.com/web-arena-x/webarena)
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

# BrowserGym imports
import browsergym.core as bgym
from browsergym.core.action.highlevel import HighLevelActionSet
from browsergym.core import chat
from browsergym.utils import cost_tracker_decorator

# AgentLab imports (assuming installed)
try:
    from agentlab.llm.chat_api import BaseModelArgs, Discussion, SystemMessage, HumanMessage, AssistantMessage
    from agentlab.llm import cost_tracker
    AGENTLAB_AVAILABLE = True
except ImportError:
    # Fallback to basic types if AgentLab not installed
    AGENTLAB_AVAILABLE = False
    print("[WARNING] AgentLab not found. Using fallback implementations.")

# Local imports
from .prompts import (
    ACIDWAVE_SYSTEM_PROMPT,
    ACIDWAVE_EXAMPLES,
    REASONING_PROMPT_ADDITION,
    OBSERVATION_TEMPLATE,
    format_action_history,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Action Parser
# ============================================================================

def parse_code_snippet(text: str) -> Optional[str]:
    """
    Extract code from markdown code blocks.

    Supports:
    ```python
    action(...)
    ```

    or
    ```
    action(...)
    ```

    Args:
        text: LLM response text

    Returns:
        Extracted code or None
    """
    # Try python code block first
    pattern = r'```python\s*\n(.*?)\n```'
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        return matches[-1].strip()  # Return last match

    # Try generic code block
    pattern = r'```\s*\n(.*?)\n```'
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        return matches[-1].strip()

    # Try single-line code (backticks)
    pattern = r'`([^`]+)`'
    matches = re.findall(pattern, text)
    if matches:
        # Filter for action-like patterns
        for match in matches:
            if any(keyword in match for keyword in ['click', 'fill', 'send_msg', 'scroll', 'press', 'hover']):
                return match.strip()

    return None


def validate_action(action_str: str) -> bool:
    """
    Validate that action string is well-formed.

    Args:
        action_str: Action string to validate

    Returns:
        True if valid, False otherwise
    """
    valid_actions = ['click', 'fill', 'press', 'hover', 'scroll', 'send_msg_to_user']

    # Check if starts with valid action name
    action_name = action_str.split('(')[0].strip()
    return action_name in valid_actions


# ============================================================================
# Agent Args (Configuration)
# ============================================================================

@dataclass
class AcidwaveAgentArgs(bgym.AgentArgs):
    """
    Configuration for Acidwave agent.

    Following AgentLab's pattern: This is a dataclass that stores all
    configuration and implements factory methods.
    """

    # Agent identification
    agent_name: str = "AcidwaveAgent"

    # LLM configuration
    model_name: str = "gpt-4o"
    temperature: float = 0.1
    max_tokens: int = 512

    # Agent behavior
    use_thinking: bool = False  # Enable chain-of-thought reasoning
    max_retry: int = 3          # Max retries for action parsing

    # Action space
    use_html: bool = True       # Use HTML observation
    use_axtree: bool = False    # Use accessibility tree
    max_html_length: int = 8192 # Max HTML characters

    # Cost tracking
    enable_cost_tracking: bool = True

    # Chat model args (for AgentLab compatibility)
    chat_model_args: Optional[Any] = None

    def make_agent(self) -> "AcidwaveAgent":
        """
        Factory method to create agent instance.

        Required by AgentLab's AgentArgs interface.

        Returns:
            Configured AcidwaveAgent instance
        """
        return AcidwaveAgent(
            model_name=self.model_name,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            use_thinking=self.use_thinking,
            max_retry=self.max_retry,
            use_html=self.use_html,
            use_axtree=self.use_axtree,
            max_html_length=self.max_html_length,
        )

    def set_reproducibility_mode(self):
        """Set temperature to 0 for reproducibility."""
        self.temperature = 0.0

    def prepare(self, storage_path: Optional[str] = None):
        """Prepare agent for execution (e.g., start servers)."""
        # No setup needed for Acidwave agent
        pass

    def close(self):
        """Clean up resources."""
        # No cleanup needed
        pass


# ============================================================================
# Agent Implementation
# ============================================================================

class AcidwaveAgent(bgym.Agent):
    """
    Acidwave music player automation agent.

    Based on:
    - AgentLab's MostBasicAgent structure
    - WebArena's PromptAgent logic

    Workflow:
    1. Receive observation (HTML + goal)
    2. Construct prompt with system message + examples + current state
    3. Call LLM to generate action
    4. Parse and validate action
    5. Return action with metadata
    """

    def __init__(
        self,
        model_name: str = "gpt-4o",
        temperature: float = 0.1,
        max_tokens: int = 512,
        use_thinking: bool = False,
        max_retry: int = 3,
        use_html: bool = True,
        use_axtree: bool = False,
        max_html_length: int = 8192,
    ):
        """
        Initialize Acidwave agent.

        Args:
            model_name: OpenAI model name
            temperature: Sampling temperature
            max_tokens: Max tokens in response
            use_thinking: Enable chain-of-thought reasoning
            max_retry: Max retries for action parsing failures
            use_html: Use HTML observations
            use_axtree: Use accessibility tree observations
            max_html_length: Max HTML characters to include
        """
        super().__init__()

        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.use_thinking = use_thinking
        self.max_retry = max_retry
        self.use_html = use_html
        self.use_axtree = use_axtree
        self.max_html_length = max_html_length

        # Initialize chat model
        if AGENTLAB_AVAILABLE and hasattr(BaseModelArgs, 'from_name'):
            # Use AgentLab's model initialization
            model_args = BaseModelArgs.from_name(model_name)
            model_args.temperature = temperature
            model_args.max_tokens = max_tokens
            self.chat_model = model_args.make_model()
        else:
            # Fallback: Use browsergym's chat model
            self.chat_model = chat.ChatModelArgs(
                model_name=model_name,
                temperature=temperature,
                max_output_tokens=max_tokens,
            ).make_model()

        # Action space (BID - Browser Interaction Description)
        self.action_set = HighLevelActionSet(
            subsets=["chat", "bid"],  # chat for send_msg_to_user, bid for browser actions
            multiaction=False,  # One action at a time
            strict=False,  # Allow flexible parsing
        )

        # Action history for context
        self.action_history: list[str] = []

        # System prompt
        system_prompt = ACIDWAVE_SYSTEM_PROMPT
        if use_thinking:
            system_prompt += REASONING_PROMPT_ADDITION

        self.system_prompt = system_prompt

        logger.info(f"Initialized AcidwaveAgent with {model_name}, temp={temperature}")

    @cost_tracker_decorator
    def get_action(self, obs: Any) -> tuple[str, dict]:
        """
        Generate next action based on observation.

        Following AgentLab's interface:
        - Input: observation dict with 'goal', 'pruned_html', etc.
        - Output: (action_string, agent_info_dict)

        Args:
            obs: Observation from environment
                Expected keys:
                - 'goal': str - Task goal
                - 'pruned_html' or 'axtree_txt': str - Page content
                - 'url': str - Current URL
                - 'last_action' (optional): str - Previous action
                - 'last_action_error' (optional): str - Error from last action

        Returns:
            (action_str, info_dict):
                action_str: BID action like 'click("[aria-label=\'SONGS\']")'
                info_dict: Metadata about generation process
        """
        # Extract observation components
        goal = obs.get("goal", "")
        url = obs.get("url", "")

        # Get HTML content
        if self.use_axtree and "axtree_txt" in obs:
            html_content = obs["axtree_txt"]
        elif "pruned_html" in obs:
            html_content = obs["pruned_html"]
        elif "dom_txt" in obs:
            html_content = obs["dom_txt"]
        else:
            html_content = "<No HTML available>"

        # Truncate if too long
        if len(html_content) > self.max_html_length:
            html_content = html_content[:self.max_html_length] + "\n\n[... HTML truncated ...]"

        # Get last action info
        last_action = obs.get("last_action", None)
        last_error = obs.get("last_action_error", None)

        if last_action:
            self.action_history.append(last_action)
            if last_error:
                self.action_history.append(f"  ERROR: {last_error}")

        # Build messages
        messages = []

        # System message
        messages.append({"role": "system", "content": self.system_prompt})

        # Add few-shot examples
        for example in ACIDWAVE_EXAMPLES:
            messages.append(example)

        # Current observation
        history_str = format_action_history(self.action_history, max_history=5)

        current_prompt = f"""Goal: {goal}

Current URL: {url}

Current Page:
{html_content}

{history_str}

What is the next action to achieve the goal? Output a single action in a code block."""

        messages.append({"role": "user", "content": current_prompt})

        # Call LLM with retry logic
        action_str = None
        llm_response = None
        parsing_error = None

        for attempt in range(self.max_retry):
            try:
                # Call LLM
                llm_response = self.chat_model(messages)

                # Extract action from code block
                action_str = parse_code_snippet(llm_response)

                if action_str is None:
                    # No code block found, try to extract directly
                    # Look for action patterns
                    for line in llm_response.split('\n'):
                        line = line.strip()
                        if validate_action(line):
                            action_str = line
                            break

                if action_str and validate_action(action_str):
                    # Success!
                    break
                else:
                    parsing_error = f"Could not parse valid action from response"
                    logger.warning(f"Attempt {attempt + 1}/{self.max_retry}: {parsing_error}")

                    # Add feedback to retry
                    if attempt < self.max_retry - 1:
                        messages.append({
                            "role": "assistant",
                            "content": llm_response
                        })
                        messages.append({
                            "role": "user",
                            "content": f"Error: {parsing_error}. Please provide a single action in a ```python code block. Use one of: click(), fill(), scroll(), press(), hover(), or send_msg_to_user()."
                        })

            except Exception as e:
                parsing_error = f"LLM call failed: {str(e)}"
                logger.error(f"Attempt {attempt + 1}/{self.max_retry}: {parsing_error}")
                if attempt == self.max_retry - 1:
                    # Last attempt failed
                    action_str = 'send_msg_to_user("Error: Could not generate action")'

        # If all retries failed
        if action_str is None or not validate_action(action_str):
            logger.error(f"Failed to generate valid action after {self.max_retry} attempts")
            action_str = 'send_msg_to_user("Error: Agent failed to generate valid action")'

        # Build agent info
        agent_info = {
            "model_name": self.model_name,
            "temperature": self.temperature,
            "llm_response": llm_response,
            "action": action_str,
            "n_attempts": attempt + 1,
            "parsing_error": parsing_error,
            "messages": messages,
        }

        # Add thinking if enabled
        if self.use_thinking and llm_response:
            # Extract thinking from response (before code block)
            thinking = llm_response.split("```")[0].strip()
            agent_info["thinking"] = thinking

        logger.info(f"Generated action: {action_str[:100]}...")

        return action_str, agent_info


# ============================================================================
# Pre-configured Agent Instances
# ============================================================================

# Standard agent with GPT-4o
ACIDWAVE_AGENT_4O = AcidwaveAgentArgs(
    agent_name="Acidwave-GPT4o",
    model_name="gpt-4o",
    temperature=0.1,
    use_thinking=False,
)

# Agent with chain-of-thought reasoning
ACIDWAVE_AGENT_4O_COT = AcidwaveAgentArgs(
    agent_name="Acidwave-GPT4o-CoT",
    model_name="gpt-4o",
    temperature=0.05,
    use_thinking=True,
)

# Fast agent with GPT-4o-mini
ACIDWAVE_AGENT_4O_MINI = AcidwaveAgentArgs(
    agent_name="Acidwave-GPT4o-Mini",
    model_name="gpt-4o-mini",
    temperature=0.1,
    use_thinking=False,
)

# Reasoning agent with GPT-4o-mini
ACIDWAVE_AGENT_4O_MINI_COT = AcidwaveAgentArgs(
    agent_name="Acidwave-GPT4o-Mini-CoT",
    model_name="gpt-4o-mini",
    temperature=0.05,
    use_thinking=True,
)