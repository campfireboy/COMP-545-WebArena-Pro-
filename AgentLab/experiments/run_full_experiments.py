"""
Full Experiment - Run All Acidwave Tasks
=========================================

Following WebArena's evaluation process, run all 16 tasks and generate detailed reports.

Usage:
    python experiments/run_full_experiments.py
    python experiments/run_full_experiments.py --difficulty easy
    python experiments/run_full_experiments.py --task-range 0 5
"""

import os
import sys
from pathlib import Path

# Load environment variables from .env file
try:
    import dotenv
    dotenv.load_dotenv()
except ImportError:
    print("⚠️ python-dotenv not found, .env file will not be loaded")

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# CRITICAL: Patch AgentLab to support Acidwave tasks in Ray workers
import patch_agentlab

from benchmark.acidwave import AcidwaveBenchmark

# Set API key if not already set
if not os.getenv("OPENAI_API_KEY"):
    print("❌ Error: OPENAI_API_KEY is not set")
    print("Please set the environment variable or create a .env file")
    sys.exit(1)

from agentlab.experiments.study import make_study
from agentlab.experiments.loop import EnvArgs
from agents.acidwave_agent import ACIDWAVE_AGENT, ACIDWAVE_REASONING_AGENT


def run_full_experiments(
    task_ids=None,
    difficulty=None,
    agent=None,
    headless=True,
    slow_mo=100,
    max_steps=30,
    n_jobs=1,
    quiet=False,
):
    """
    Run complete Acidwave experiments
    
    Args:
        task_ids: List of task IDs to run (None = all)
        difficulty: Filter by difficulty ("easy", "medium", "hard")
        agent: Agent to use (default: ACIDWAVE_AGENT)
        headless: Whether to run in headless mode
        slow_mo: Browser operation delay (ms)
        max_steps: Maximum steps per task
        n_jobs: Number of parallel tasks
        quiet: Quiet mode, reduce terminal output
    """
    def log(msg="", level="info"):
        """Conditional print function"""
        if quiet and level == "info":
            return
        print(msg)
    
    log("\n" + "="*80)
    log("ACIDWAVE Full Experiment - WebArena Style Evaluation")
    log("="*80)
    
    # Select agent
    if agent is None:
        agent = ACIDWAVE_AGENT
    
    log(f"\n🤖 Agent Configuration:")
    log(f"   Name: {agent.agent_name}")
    log(f"   Model: {agent.chat_model_args.model_name}")
    log(f"   Temperature: {agent.chat_model_args.temperature}")
    
    # Load benchmark
    log("\n[1/6] Loading tasks...")
    
    # Determine task subset
    if task_ids is not None:
        # Explicit task IDs
        benchmark = AcidwaveBenchmark(task_subset=task_ids)
        log(f"   Using specified tasks: {task_ids}")
    elif difficulty is not None:
        # Filter by difficulty
        temp_benchmark = AcidwaveBenchmark()
        filtered_tasks = temp_benchmark.get_tasks_by_difficulty(difficulty)
        task_ids = [t["task_id"] for t in filtered_tasks]
        benchmark = AcidwaveBenchmark(task_subset=task_ids)
        log(f"   Filtered by difficulty: {difficulty}")
        log(f"   Matching tasks: {len(task_ids)} tasks")
    else:
        # All tasks
        benchmark = AcidwaveBenchmark()
        log(f"   Loaded all tasks: {len(benchmark)} tasks")
    
    # Show task details
    if not quiet:
        log(f"\n   Task Details:")
        for i, task in enumerate(benchmark):
            log(f"      [{task['task_id']}] ({task['difficulty']:6s}) {task['intent'][:50]}...")
    
    # Configure browser settings
    log(f"\n🖥️  Browser Configuration:")
    log(f"   Display Mode: {'Headless' if headless else 'Visual'}")
    log(f"   Operation Delay: {slow_mo}ms")
    log(f"   Max Steps: {max_steps}")
    log(f"   Parallel Tasks: {n_jobs}")
    
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
        
        # Create study
        suffix = f"full_experiment"
        if difficulty:
            suffix += f"_{difficulty}"
        if task_ids and len(task_ids) < 16:
            suffix += f"_tasks{len(task_ids)}"
        
        study = make_study(
            agent_args=[agent],
            benchmark=benchmark,
            suffix=suffix,
            comment=f"Full evaluation: {len(benchmark)} tasks",
        )
        log(f"   Experiment name: {study.name}")
        log(f"   Experiment directory: {study.dir}")
        
    except Exception as e:
        print(f"   ❌ Cannot create experiment: {e}")  # Always show errors
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Check Acidwave is running
    # log("\n[3/6] Checking Acidwave environment...")
    # import requests
    # try:
    #     response = requests.get("http://localhost:5173", timeout=3)
    #     if response.status_code == 200:
    #         log("   ✅ Acidwave frontend running normally")
    #     else:
    #         log(f"   ⚠️  Frontend returned status {response.status_code}")
    # except requests.exceptions.RequestException:
    #     print("   ❌ Cannot connect to Acidwave!")  # Always show errors
    #     print("   Please start first: docker-compose up -d")
    #     response = input("\n   Continue? (y/n): ")
    #     if response.lower() != 'y':
    #         sys.exit(1)
    
    # Run experiments
    log("\n[4/6] Running experiments...")
    log(f"   This may take {len(benchmark) * 2}-{len(benchmark) * 5} minutes...")
    
    if not headless and not quiet:
        log("\n   💡 Browser window will open, you can watch the agent's actions")
    
    try:
        study.run(n_jobs=n_jobs)
        log("   ✅ Experiment completed!")
    except Exception as e:
        print(f"   ❌ Experiment failed: {e}")  # Always show errors
        print(f"\n   View logs: {study.dir}")
        sys.exit(1)
    
    # Analyze results
    log("\n[5/6] Analyzing results...")
    from agentlab.analyze import inspect_results
    
    summary_file = None  # Initialize to avoid UnboundLocalError
    
    try:
        result_df = inspect_results.load_result_df(study.dir)

        # Enrich with difficulty if missing
        if "difficulty" not in result_df.columns:
            difficulty_map = {
                f"acidwave.task_{t['task_id']}": t.get("difficulty", "unknown")
                for t in benchmark
            }

            # Try to find a task identifier column
            task_col = None
            for candidate in ["task_name", "env_name", "task", "env_id"]:
                if candidate in result_df.columns:
                    task_col = candidate
                    break

            if task_col:
                result_df["difficulty"] = result_df[task_col].map(
                    lambda tn: difficulty_map.get(tn, "unknown")
                )
            else:
                # Fallback: fill with unknown to avoid KeyError in downstream analysis
                result_df["difficulty"] = "unknown"
        
        log("\n" + "="*80)
        log("Experiment Results")
        log("="*80)
        
        # Overall metrics
        total = len(result_df)
        success_count = (result_df["cum_reward"] > 0.8).sum()
        partial_count = ((result_df["cum_reward"] > 0.3) & 
                        (result_df["cum_reward"] <= 0.8)).sum()
        fail_count = (result_df["cum_reward"] <= 0.3).sum()
        
        success_rate = (success_count / total * 100) if total > 0 else 0
        
        # Always show key results
        print(f"\n📊 Overall Performance:")
        print(f"   Success: {success_count:2d} / {total} ({success_rate:5.1f}%)")
        print(f"   Partial: {partial_count:2d} / {total}")
        print(f"   Failed: {fail_count:2d} / {total}")
        
        # By difficulty
        if not quiet and ("difficulty" in result_df.columns or len(benchmark._tasks) > 0):
            print(f"\n📈 Analysis by Difficulty:")
            
            # Add difficulty to results - check for task_name column
            if 'task_name' in result_df.columns:
                task_difficulty = {
                    f"acidwave.task_{t['task_id']}": t['difficulty']
                    for t in benchmark._tasks
                }
                result_df['difficulty'] = result_df['task_name'].map(task_difficulty)
            elif 'exp_args.env_args.task_name' in result_df.columns:
                # Alternative column name
                task_difficulty = {
                    f"acidwave.task_{t['task_id']}": t['difficulty']
                    for t in benchmark._tasks
                }
                result_df['difficulty'] = result_df['exp_args.env_args.task_name'].map(task_difficulty)
            
            for diff in ["easy", "medium", "hard"]:
                diff_tasks = result_df[result_df['difficulty'] == diff]
                if len(diff_tasks) > 0:
                    diff_success = (diff_tasks["cum_reward"] > 0.8).sum()
                    diff_total = len(diff_tasks)
                    diff_rate = (diff_success / diff_total * 100) if diff_total > 0 else 0
                    print(f"   {diff:6s}: {diff_success:2d}/{diff_total:2d} ({diff_rate:5.1f}%)")
        
        # Per-task details
        if not quiet:
            print(f"\n📝 Task Details:")
            
            # Find the task name column
            task_col = None
            for col in ['task_name', 'exp_args.env_args.task_name']:
                if col in result_df.columns:
                    task_col = col
                    break
            
            for _, row in result_df.iterrows():
                if task_col:
                    task_name = row.get(task_col, "Unknown")
                else:
                    task_name = "Unknown"
                    
                task_id = task_name.split("_")[-1] if "_" in task_name else "?"
                reward = row.get("cum_reward", 0)
                steps = row.get("n_steps", 0)
                error = row.get("err_msg", "")
                
                # Status icon
                if reward > 0.8:
                    status = "✅"
                elif reward > 0.3:
                    status = "🔶"
                else:
                    status = "❌"
                
                # Get task difficulty
                diff = row.get("difficulty", "?")
                
                print(f"   {status} Task {task_id} ({diff:6s}): Score={reward:.2f}, Steps={steps}")
                if error and reward <= 0.8:
                    print(f"      Error: {error[:70]}")
        
        # Save summary
        log("\n[6/6] Saving report...")
        
        # Summary file
        summary_file = study.dir / "experiment_summary.txt"
        with open(summary_file, 'w', encoding='utf-8') as f:
            f.write("="*80 + "\n")
            f.write("ACIDWAVE Experiment Summary\n")
            f.write("="*80 + "\n\n")
            f.write(f"Agent: {agent.agent_name}\n")
            f.write(f"Model: {agent.chat_model_args.model_name}\n")
            f.write(f"Tasks: {total}\n\n")
            f.write(f"Success Rate: {success_rate:.1f}% ({success_count}/{total})\n")
            f.write(f"Partial: {partial_count}/{total}\n")
            f.write(f"Failed: {fail_count}/{total}\n\n")
            f.write("="*80 + "\n")
            f.write("Detailed Results\n")
            f.write("="*80 + "\n\n")
            f.write(result_df.to_string())
        
        log(f"   ✅ Summary saved: {summary_file}")
        
        # CSV export
        csv_file = study.dir / "results.csv"
        result_df.to_csv(csv_file, index=False)
        log(f"   ✅ CSV exported: {csv_file}")
        
    except Exception as e:
        print(f"   ⚠️  Cannot analyze results: {e}")  # Always show errors
        import traceback
        traceback.print_exc()
    
    # Final summary
    log("\n" + "="*80)
    log("Experiment Completed!")
    log("="*80)
    print(f"\n📁 Results Directory: {study.dir}")  # Always show final results
    
    if not quiet:
        log("\n📊 Next Steps:")
        if summary_file:
            log("   1. View detailed report:")
            log(f"      cat {summary_file}")
        log("   2. View screenshots of failed tasks:")
        log(f"      cd {study.dir}")
        log("      ls */screenshot_*.png")
        log("   3. Use AgentXray for visualization:")
        log("      agentlab-xray")
        log("\n💡 Optimization Suggestions:")
        try:
            # Try to get success_rate from earlier
            if 'success_rate' in locals():
                if success_rate < 50:
                    log("   - Low success rate, consider:")
                    log("     • Improve agent prompts")
                    log("     • Increase max_steps")
                    log("     • Use ACIDWAVE_REASONING_AGENT")
                elif success_rate < 80:
                    log("   - Medium success rate, consider:")
                    log("     • Adjust temperature parameter")
                    log("     • Improve validation logic")
                else:
                    log("   - Great success rate! You can:")
                    log("     • Try harder tasks")
                    log("     • Optimize step efficiency")
        except:
            pass


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Run complete Acidwave experiments (WebArena style)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run all tasks
  python experiments/run_full_experiments.py
  
  # Run only easy tasks
  python experiments/run_full_experiments.py --difficulty easy
  
  # Run specified task range
  python experiments/run_full_experiments.py --task-range 0 5
  
  # Use reasoning agent
  python experiments/run_full_experiments.py --agent reasoning
  
  # Visual mode (show browser)
  python experiments/run_full_experiments.py --no-headless --slow-mo 1000
  
  # Parallel execution (requires sufficient resources)
  python experiments/run_full_experiments.py --n-jobs 3
        """
    )
    
    parser.add_argument(
        '--difficulty',
        choices=['easy', 'medium', 'hard'],
        help='Filter tasks by difficulty'
    )
    
    parser.add_argument(
        '--task-range',
        nargs=2,
        type=int,
        metavar=('START', 'END'),
        help='Run task ID range (e.g., 0 5 means tasks 0-4)'
    )
    
    parser.add_argument(
        '--task-ids',
        nargs='+',
        type=int,
        help='Specify task ID list (e.g., 0 2 5 7)'
    )
    
    parser.add_argument(
        '--agent',
        choices=['standard', 'reasoning', 'fast'],
        default='standard',
        help='Select agent type (default: standard)'
    )
    
    parser.add_argument(
        '--no-headless',
        action='store_true',
        help='Show browser window'
    )
    
    parser.add_argument(
        '--slow-mo',
        type=int,
        default=100,
        help='Browser operation delay (ms, default: 100)'
    )
    
    parser.add_argument(
        '--max-steps',
        type=int,
        default=30,
        help='Maximum steps per task (default: 30)'
    )
    
    parser.add_argument(
        '--n-jobs',
        type=int,
        default=1,
        help='Number of parallel tasks (default: 1, sequential execution)'
    )
    
    parser.add_argument(
        '--quiet',
        action='store_true',
        help='Quiet mode, reduce terminal output'
    )
    
    args = parser.parse_args()
    
    # Determine task IDs
    task_ids = None
    if args.task_ids:
        task_ids = args.task_ids
    elif args.task_range:
        start, end = args.task_range
        task_ids = list(range(start, end))
    
    # Select agent
    from agents.acidwave_agent import ACIDWAVE_FAST_AGENT
    agent_map = {
        'standard': ACIDWAVE_AGENT,
        'reasoning': ACIDWAVE_REASONING_AGENT,
        'fast': ACIDWAVE_FAST_AGENT,
    }
    agent = agent_map[args.agent]
    
    # Run experiments
    run_full_experiments(
        task_ids=task_ids,
        difficulty=args.difficulty,
        agent=agent,
        headless=not args.no_headless,
        slow_mo=args.slow_mo,
        max_steps=args.max_steps,
        n_jobs=args.n_jobs,
        quiet=args.quiet,
    )


if __name__ == "__main__":
    main()
