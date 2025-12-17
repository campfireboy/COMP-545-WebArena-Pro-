"""
Run MyDrive Experiments
=======================

Execute MyDrive tasks using AgentLab's infrastructure.
"""

import os
import sys
from pathlib import Path

# Load environment variables from .env file
try:
    import dotenv
    dotenv.load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    print("⚠️ python-dotenv not found, .env file will not be loaded")

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# CRITICAL: Patch AgentLab to support MyDrive tasks
import patch_agentlab

from benchmark.mydrive.benchmark import MyDriveBenchmark

# Set API key if not already set (check both OpenAI and Anthropic)
if not os.getenv("OPENAI_API_KEY") and not os.getenv("ANTHROPIC_API_KEY"):
    print("❌ Error: No API keys found (OPENAI_API_KEY or ANTHROPIC_API_KEY)")
    print("Please set the environment variable or create a .env file")
    sys.exit(1)

from agentlab.experiments.study import make_study
from agentlab.experiments.loop import EnvArgs
from agents.acidwave_agent import ACIDWAVE_AGENT, ACIDWAVE_REASONING_AGENT


def run_mydrive_experiments(
    task_ids=None,
    agent=None,
    headless=True,
    slow_mo=100,
    max_steps=30,
    n_jobs=1,
    quiet=False,
):
    """
    Run MyDrive experiments
    """
    def log(msg="", level="info"):
        if quiet and level == "info":
            return
        print(msg)
    
    log("\n" + "="*80)
    log("MyDrive Experiment Runner")
    log("="*80)
    
    # Select agent
    if agent is None:
        agent = ACIDWAVE_AGENT
    
    log(f"\n🤖 Agent Configuration:")
    log(f"   Name: {agent.agent_name}")
    log(f"   Model: {agent.chat_model_args.model_name}")
    
    # Load benchmark
    log("\n[1/6] Loading tasks...")
    benchmark = MyDriveBenchmark(task_subset=task_ids)
    log(f"   Loaded tasks: {len(benchmark)} tasks")
    
    # Show task details
    if not quiet:
        log(f"\n   Task Details:")
        for idx, task in enumerate(benchmark):
            log(f"      [{task['task_id']}] {task['intent'][:60]}...")
    
    # Browser config
    log(f"\n🖥️  Browser Configuration:")
    log(f"   Display Mode: {'Headless' if headless else 'Visual'}")
    log(f"   Target: {os.environ.get('MYDRIVE_BASE_URL', 'http://localhost:3000')}")

    # Create study
    log("\n[2/6] Creating experiment...")
    try:
        # Create custom EnvArgs with settings
        custom_env_args_list = []
        for env_arg in benchmark.env_args_list:
            custom_env_arg = EnvArgs(
                task_name=env_arg.task_name,
                task_seed=env_arg.task_seed,
                task_kwargs=env_arg.task_kwargs,
                max_steps=max_steps,
                headless=headless,
                slow_mo=slow_mo,
                viewport={"width": 1280, "height": 720},
                record_video=False,
            )
            custom_env_args_list.append(custom_env_arg)
        
        benchmark.env_args_list = custom_env_args_list
        
        study = make_study(
            agent_args=[agent],
            benchmark=benchmark,
            suffix="mydrive",
            comment=f"MyDrive evaluation: {len(benchmark)} tasks",
        )
        log(f"   Experiment directory: {study.dir}")
        
    except Exception as e:
        print(f"   ❌ Cannot create experiment: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Run experiments
    log("\n[4/6] Running experiments...")
    if not headless and not quiet:
        log("\n   💡 Browser window will open")
    
    try:
        study.run(n_jobs=n_jobs)
        log("   ✅ Experiment completed!")
    except Exception as e:
        print(f"   ❌ Experiment failed: {e}")
        print(f"\n   View logs: {study.dir}")
        sys.exit(1)
        
    log(f"\n   Results saved to: {study.dir}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run MyDrive experiments")
    
    parser.add_argument('--task-ids', nargs='+', type=int, help='Specify task ID list (e.g., 0 2)')
    parser.add_argument('--no-headless', action='store_true', help='Show browser window')
    parser.add_argument('--slow-mo', type=int, default=100, help='Browser delay (ms)')
    
    args = parser.parse_args()
    
    run_mydrive_experiments(
        task_ids=args.task_ids,
        headless=not args.no_headless,
        slow_mo=args.slow_mo
    )

if __name__ == "__main__":
    main()
