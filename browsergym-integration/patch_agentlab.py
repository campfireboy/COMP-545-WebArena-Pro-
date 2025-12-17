"""
AgentLab Patch for Acidwave Tasks
===================================

This module patches AgentLab's _get_env_name function to support Acidwave tasks.

Import this module BEFORE running AgentLab experiments to ensure Acidwave tasks
are properly registered in Ray workers.

Usage:
    import patch_agentlab  # Must be first!
    from agentlab.experiments.study import make_study
"""

import os
import sys

# 控制调试输出 - 设置环境变量 ACIDWAVE_DEBUG=1 启用详细输出
ACIDWAVE_DEBUG = os.environ.get('ACIDWAVE_DEBUG', '0') == '1'

def debug_print(msg):
    """条件打印调试信息"""
    if ACIDWAVE_DEBUG:
        print(msg)


def patch_gymnasium_for_acidwave():
    """
    Patch Gymnasium's _find_spec to auto-import benchmark.acidwave when acidwave tasks are requested.
    
    This is a fallback to ensure tasks are registered even in Ray workers.
    """
    try:
        import gymnasium
        from gymnasium.envs import registration
        
        # Save original function
        _original_find_spec = registration._find_spec
        
        def _patched_find_spec(env_id: str):
            """Enhanced _find_spec that auto-imports acidwave benchmark."""
            # Check if it's an acidwave task
            if "acidwave" in env_id.lower():
                # Force import to register tasks
                try:
                    import benchmark.acidwave
                    debug_print(f"[patch_gymnasium] Auto-imported benchmark.acidwave for {env_id} in PID {os.getpid()}")
                except Exception as e:
                    debug_print(f"[patch_gymnasium] Failed to import benchmark.acidwave: {e}")
            
            # Check if it's a mydrive task
            if "mydrive" in env_id.lower():
                try:
                    import benchmark.mydrive
                    debug_print(f"[patch_gymnasium] Auto-imported benchmark.mydrive for {env_id} in PID {os.getpid()}")
                except Exception as e:
                    debug_print(f"[patch_gymnasium] Failed to import benchmark.mydrive: {e}")
            
            # Call original function
            return _original_find_spec(env_id)
        
        # Replace the function
        registration._find_spec = _patched_find_spec
        
        debug_print("[patch_gymnasium] Successfully patched Gymnasium for Acidwave tasks")
        return True
        
    except Exception as e:
        debug_print(f"[patch_gymnasium] Error patching Gymnasium: {e}")
        return False


def patch_agentlab_for_acidwave():
    """
    Patch AgentLab's _get_env_name function to include Acidwave task registration.

    This ensures that when Ray workers try to create Acidwave environments,
    the benchmark package is imported and tasks are registered.
    """
    try:
        from agentlab.experiments import loop

        # Save original function
        _original_get_env_name = loop._get_env_name

        def _patched_get_env_name(task_name: str):
            """Enhanced version that handles Acidwave tasks."""
            import sys
            import os
            from pathlib import Path
            
            debug_print(f"[patch_agentlab._patched_get_env_name] Called with task_name={task_name}, PID={os.getpid()}")
            
            # Register Acidwave tasks if needed
            if task_name.startswith("acidwave"):
                # CRITICAL: Ensure project root is in sys.path
                project_root = Path(__file__).parent
                if str(project_root) not in sys.path:
                    sys.path.insert(0, str(project_root))
                    debug_print(f"[patch_agentlab] Added {project_root} to sys.path")
                
                # Force import of benchmark package
                # This triggers automatic registration via benchmark/acidwave/__init__.py
                try:
                    import benchmark.acidwave
                    debug_print(f"[patch_agentlab] Successfully imported benchmark.acidwave (registered {len(benchmark.acidwave.ALL_ACIDWAVE_TASK_IDS)} tasks) in PID {os.getpid()}")
                    
                    # Verify registration
                    import gymnasium as gym
                    registry = gym.envs.registry
                    acidwave_tasks = [env_id for env_id in registry if 'acidwave' in env_id]
                    debug_print(f"[patch_agentlab] Found {len(acidwave_tasks)} acidwave tasks in gym registry")
                    
                except ImportError as e:
                    print(f"[patch_agentlab] ERROR: Failed to import benchmark.acidwave: {e}")
                    print(f"[patch_agentlab] sys.path = {sys.path}")
                    raise
            
            # Register MyDrive tasks if needed
            if task_name.startswith("mydrive"):
                project_root = Path(__file__).parent
                if str(project_root) not in sys.path:
                    sys.path.insert(0, str(project_root))
                
                try:
                    import benchmark.mydrive
                    debug_print(f"[patch_agentlab] Successfully imported benchmark.mydrive")
                except ImportError as e:
                    print(f"[patch_agentlab] ERROR: Failed to import benchmark.mydrive: {e}")
                    raise

            # Call original function for other tasks
            result = _original_get_env_name(task_name)
            debug_print(f"[patch_agentlab._patched_get_env_name] Returning: {result}")
            return result

        # Replace the function
        loop._get_env_name = _patched_get_env_name

        debug_print("[patch_agentlab] Successfully patched AgentLab for Acidwave tasks")
        return True

    except ImportError as e:
        debug_print(f"[patch_agentlab] Warning: Could not patch AgentLab: {e}")
        debug_print("[patch_agentlab] Make sure agentlab is installed")
        return False
    except Exception as e:
        debug_print(f"[patch_agentlab] Error patching AgentLab: {e}")
        import traceback
        traceback.print_exc()
        return False


def patch_ray_init_for_acidwave():
    """
    Patch ray.init to automatically set up runtime_env for Acidwave tasks.
    
    This ensures Ray workers will have the correct sys.path and worker_process_setup_hook
    to import and register Acidwave tasks.
    """
    try:
        import ray
        from pathlib import Path
        
        # Save original ray.init
        _original_ray_init = ray.init
        
        def _patched_ray_init(*args, **kwargs):
            """Enhanced ray.init that adds Acidwave runtime_env."""
            debug_print(f"[patch_ray_init] Patching ray.init with Acidwave runtime_env")
            
            # Get project root directory
            project_root = Path(__file__).parent.absolute()
            
            # Set up runtime_env if not provided
            if 'runtime_env' not in kwargs:
                kwargs['runtime_env'] = {}
            
            # Add our project root to PYTHONPATH in workers
            env_vars = kwargs['runtime_env'].get('env_vars', {})
            current_pythonpath = env_vars.get('PYTHONPATH', '')
            
            if current_pythonpath:
                env_vars['PYTHONPATH'] = f"{project_root}{os.pathsep}{current_pythonpath}"
            else:
                env_vars['PYTHONPATH'] = str(project_root)
            
            kwargs['runtime_env']['env_vars'] = env_vars
            
            # Add worker process setup hook
            # This will import our ray_worker_init module in each worker process
            kwargs['runtime_env']['worker_process_setup_hook'] = (
                lambda: __import__('ray_worker_init')
            )
            
            debug_print(f"[patch_ray_init] Runtime env configured:")
            debug_print(f"[patch_ray_init]   PYTHONPATH: {env_vars['PYTHONPATH']}")
            debug_print(f"[patch_ray_init]   worker_process_setup_hook: ray_worker_init")
            
            # Call original ray.init
            return _original_ray_init(*args, **kwargs)
        
        # Replace ray.init
        ray.init = _patched_ray_init
        
        debug_print("[patch_ray_init] Successfully patched ray.init for Acidwave tasks")
        return True
        
    except ImportError:
        debug_print("[patch_ray_init] Ray not installed, skipping patch")
        return False
    except Exception as e:
        debug_print(f"[patch_ray_init] Error patching ray.init: {e}")
        import traceback
        traceback.print_exc()
        return False



# Auto-patch on import
patch_gymnasium_for_acidwave()  # CRITICAL: Patch Gymnasium first
patch_agentlab_for_acidwave()   # Then patch AgentLab
patch_ray_init_for_acidwave()   # Finally patch Ray to setup worker initialization


# CRITICAL: Also ensure benchmark is imported in main process
try:
    import benchmark.acidwave
    debug_print(f"[patch_agentlab] Registered {len(benchmark.acidwave.ALL_ACIDWAVE_TASK_IDS)} tasks in main process (PID {os.getpid()})")
    
    # Verify tasks are actually registered
    import gymnasium as gym
    registry = gym.envs.registry
    acidwave_tasks = [env_id for env_id in registry if 'acidwave' in env_id]
    if acidwave_tasks:
        debug_print(f"[patch_agentlab] Verified {len(acidwave_tasks)} Acidwave tasks in Gymnasium registry")
    else:
        print("[patch_agentlab] WARNING: No Acidwave tasks found in Gymnasium registry!")
        
except ImportError as e:
    print(f"[patch_agentlab] Warning: Could not import benchmark.acidwave: {e}")
except Exception as e:
    print(f"[patch_agentlab] Error during task registration: {e}")

