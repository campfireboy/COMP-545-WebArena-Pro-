"""
Run MyDrive Composite Experiments (Multi-Agent)
===============================================

Execute MyDrive task 102 (multi-agent) using AgentLab's infrastructure
with a dedicated runner defaulting to n_jobs=2.
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

# Set API key if not already set
if not os.getenv("OPENAI_API_KEY") and not os.getenv("ANTHROPIC_API_KEY"):
    print("❌ Error: No API keys found")
    sys.exit(1)

from agentlab.experiments.study import make_study
from agentlab.experiments.loop import EnvArgs
from agents.acidwave_agent import ACIDWAVE_AGENT

def run_composite_experiments(
    headless=True,
    slow_mo=3000,
    max_steps=30,
    n_jobs=2,
):
    """
    Run MyDrive composite experiments
    """
    print("\n" + "="*80)
    print("MyDrive Composite Experiment Runner (Multi-Agent)")
    print("="*80)
    
    agent = ACIDWAVE_AGENT
    
    # Load benchmark with composite task file
    print("\n[1/6] Loading tasks from test_composite.raw.json...")
    benchmark = MyDriveBenchmark(task_file="test_composite.raw.json", slow_mo=slow_mo, headless=headless, max_steps=max_steps)
    print(f"   Loaded tasks: {len(benchmark)} tasks")
    
    # Browser config
    print(f"\n🖥️  Browser Configuration:")
    print(f"   Display Mode: {'Headless' if headless else 'Visual'}")
    print(f"   Jobs: {n_jobs}")

    # Create study
    print("\n[2/6] Creating experiment...")
    try:
        # Create custom EnvArgs with settings
        custom_env_args_list = []
        for env_arg in benchmark.env_args_list:
            task_id = env_arg.task_kwargs.get("task_id")
            if task_id is None:
                # Parse from task_name: "mydrive.task_102"
                import re
                match = re.search(r"task_(\d+)", env_arg.task_name)
                if match:
                    task_id = int(match.group(1))
            
            task_config = None
            for t in benchmark:
                 if t["task_id"] == task_id:
                     task_config = t
                     break
            
            if task_config and "eval" in task_config and task_config["eval"].get("type") == "composite":
                sub_tasks = task_config["eval"].get("sub_tasks", [])
                print(f"   Detected composite task {task_id} with {len(sub_tasks)} agents/sub-tasks")
                
                for idx, sub in enumerate(sub_tasks):
                    new_kwargs = env_arg.task_kwargs.copy()
                    new_kwargs["sub_task_id"] = idx
                    
                    custom_env_arg = EnvArgs(
                        task_name=env_arg.task_name,
                        task_seed=env_arg.task_seed + idx, 
                        task_kwargs=new_kwargs,
                        max_steps=max_steps,
                        headless=headless,
                        slow_mo=slow_mo,
                        viewport={"width": 1280, "height": 720},
                        record_video=False,
                    )
                    custom_env_args_list.append(custom_env_arg)
            else:
                # Should not happen if file only has composite task, but for safety
                custom_env_args_list.append(env_arg)
        
        benchmark.env_args_list = custom_env_args_list
        
        study = make_study(
            agent_args=[agent],
            benchmark=benchmark,
            suffix="mydrive-composite",
            comment=f"MyDrive Composite: {len(benchmark)} tasks",
        )
        print(f"   Experiment directory: {study.dir}")
        
    except Exception as e:
        print(f"   ❌ Cannot create experiment: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Run experiments
    print("\n[4/6] Running composite experiments...")
    
    try:
        study.run(n_jobs=n_jobs)
        print("   ✅ Composite Experiment completed!")
    except Exception as e:
        print(f"   ❌ Experiment failed: {e}")
        sys.exit(1)
        
    print(f"\n   Results saved to: {study.dir}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run MyDrive Composite Experiments")
    parser.add_argument('--no-headless', action='store_true', help='Show browser window')
    parser.add_argument('--n-jobs', type=int, default=2, help='Number of parallel jobs (default: 2)')
    
    args = parser.parse_args()
    
    run_composite_experiments(
        headless=not args.no_headless,
        n_jobs=args.n_jobs
    )

if __name__ == "__main__":
    main()
