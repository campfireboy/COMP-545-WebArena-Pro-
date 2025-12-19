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
from agents.acidwave_agent import (
    ACIDWAVE_AGENT, 
    ACIDWAVE_REASONING_AGENT, 
    ACIDWAVE_FAST_AGENT
)


def run_mydrive_experiments(
    task_ids=None,
    models=None,
    headless=True,
    slow_mo=100,
    max_steps=30,
    n_jobs=1,
    quiet=False,
    viewport=None,
):
    """
    Run MyDrive experiments
    """
    if viewport is None:
        viewport = {"width": 1280, "height": 720} # Default standard viewport

    def log(msg="", level="info"):
        if quiet and level == "info":
            return
        print(msg)
    
    log("\n" + "="*80)
    log("MyDrive Experiment Runner")
    log("="*80)
    
    # Select agents
    agents_to_run = []
    if models is None or "4o" in models:
        agents_to_run.append(ACIDWAVE_AGENT)
    if models and "4o-mini" in models:
        agents_to_run.append(ACIDWAVE_FAST_AGENT)
    if models and "4o-cot" in models:
        agents_to_run.append(ACIDWAVE_REASONING_AGENT)
    if models and "all" in models:
        agents_to_run = [ACIDWAVE_AGENT, ACIDWAVE_FAST_AGENT, ACIDWAVE_REASONING_AGENT]
        
    # Default fallback
    if not agents_to_run:
        agents_to_run = [ACIDWAVE_AGENT]
    
    log(f"\n🤖 Agent Configuration:")
    for agent in agents_to_run:
        log(f"   - {agent.agent_name} ({agent.chat_model_args.model_name})")
    
    # Load benchmark
    log("\n[1/6] Loading tasks...")
    benchmark = MyDriveBenchmark(task_subset=task_ids, viewport=viewport)
    log(f"   Loaded tasks: {len(benchmark)} tasks")
    
    # Show task details
    if not quiet:
        log(f"\n   Task Details:")
        for idx, task in enumerate(benchmark):
            log(f"      [{task['task_id']}] {task['intent'][:60]}...")
    
    # Browser config
    log(f"\n🖥️  Browser Configuration:")
    log(f"   Display Mode: {'Headless' if headless else 'Visual'}")
    log(f"   Viewport: {viewport['width']}x{viewport['height']}")
    log(f"   Target: {os.environ.get('MYDRIVE_BASE_URL', 'http://localhost:3000/login')}")

    # Create study
    log("\n[2/6] Creating experiment...")
    try:
        # Create custom EnvArgs with settings
        custom_env_args_list = []
        for env_arg in benchmark.env_args_list:
            task_id = env_arg.task_kwargs.get("task_id")
            if task_id is None:
                # Try to parse from task_name: "mydrive.task_102"
                import re
                match = re.search(r"task_(\d+)", env_arg.task_name)
                if match:
                    task_id = int(match.group(1))
            
            task_config = benchmark.tasks[task_id] if hasattr(benchmark, 'tasks') and task_id in benchmark.tasks else None 
            
            # Helper to find config 
            if not task_config:
                 for t in benchmark:
                     if t["task_id"] == task_id:
                         task_config = t
                         break
            
            
            is_composite = False
            if task_config and "eval" in task_config and task_config["eval"].get("type") == "composite":
                is_composite = True
                sub_tasks = task_config["eval"].get("sub_tasks", [])
                log(f"   Detected composite task {task_id} with {len(sub_tasks)} agents/sub-tasks")
                
                for idx, sub in enumerate(sub_tasks):
                    # Create EnvArgs for each sub-task
                    # We utilize the same seed but distinct sub_task_id
                    new_kwargs = env_arg.task_kwargs.copy()
                    new_kwargs["sub_task_id"] = idx
                    
                    # Optional: append agent name to task name for clarity in logs/results
                    agent_name = sub.get("agent", f"agent{idx+1}")
                    
                    custom_env_arg = EnvArgs(
                        task_name=env_arg.task_name,
                        task_seed=env_arg.task_seed + idx, # distinct seed for sub-tasks
                        task_kwargs=new_kwargs,
                        max_steps=max_steps,
                        headless=headless,
                        slow_mo=slow_mo,
                        viewport=viewport,
                        record_video=False,
                    )
                    custom_env_args_list.append(custom_env_arg)
            
            if not is_composite:
                custom_env_arg = EnvArgs(
                    task_name=env_arg.task_name,
                    task_seed=env_arg.task_seed,
                    task_kwargs=env_arg.task_kwargs,
                    max_steps=max_steps,
                    headless=headless,
                    slow_mo=slow_mo,
                    viewport=viewport,
                    record_video=False,
                )
                custom_env_args_list.append(custom_env_arg)
        
        benchmark.env_args_list = custom_env_args_list
        
        study = make_study(
            agent_args=agents_to_run,
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
    total_experiments = len(benchmark) * len(agents_to_run)
    est_time_per_task = 2.0 # minutes, approximate
    total_est_minutes = (total_experiments * est_time_per_task) / n_jobs
    
    log("\n[4/6] Running experiments...")
    log(f"   Total experiments to run: {total_experiments} ({len(benchmark)} tasks x {len(agents_to_run)} models)")
    log(f"   Estimated duration: ~{total_est_minutes:.1f} minutes (@ {est_time_per_task}m/task, {n_jobs} parallel jobs)")
    
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
    parser.add_argument('--model', nargs='+', choices=['4o', '4o-mini', '4o-cot', 'all'], default=['4o'], help='Select agent models (default: 4o)')
    parser.add_argument('--no-headless', action='store_true', help='Show browser window')
    parser.add_argument('--slow-mo', type=int, default=100, help='Browser delay (ms)')
    parser.add_argument('--n-jobs', type=int, default=1, help='Number of parallel jobs')
    parser.add_argument('--viewport', type=str, default="1280x720", help='Viewport size (widthxheight), default: 1280x720')
    
    args = parser.parse_args()
    
    # Parse viewport
    try:
        w, h = map(int, args.viewport.lower().split('x'))
        viewport = {"width": w, "height": h}
    except ValueError:
        print("Invalid viewport format. Use widthxheight (e.g., 1920x1080)")
        sys.exit(1)
    
    run_mydrive_experiments(
        task_ids=args.task_ids,
        models=args.model,
        headless=not args.no_headless,
        slow_mo=args.slow_mo,
        n_jobs=args.n_jobs,
        viewport=viewport
    )


if __name__ == "__main__":
    main()
