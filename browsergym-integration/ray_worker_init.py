"""
Ray Worker 初始化脚本
=====================

这个脚本确保每个 Ray Worker 启动时都会注册 Acidwave 任务。

使用方法：
在启动 Ray 实验时，使用 runtime_env 参数：
    runtime_env = {
        "worker_process_setup_hook": init_ray_worker,
    }
"""

import os
import sys
from pathlib import Path

# 控制调试输出 - 设置环境变量 ACIDWAVE_DEBUG=1 启用详细输出
ACIDWAVE_DEBUG = os.environ.get('ACIDWAVE_DEBUG', '0') == '1'

def debug_print(msg):
    """条件打印调试信息"""
    if ACIDWAVE_DEBUG:
        print(msg)


def init_ray_worker():
    """在每个 Ray Worker 中初始化 Acidwave 任务
    
    这个函数会：
    1. 添加项目根目录到 sys.path
    2. 导入 patch_agentlab 模块（会自动 patch AgentLab 和 Gymnasium）
    3. 导入 benchmark.acidwave 包（会自动注册所有任务）
    """
    # 添加项目根目录到路径
    project_root = Path(__file__).parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
        debug_print(f"[ray_worker_init] Added {project_root} to sys.path in PID {os.getpid()}")
    
    try:
        # 导入 patch（会自动注册任务）
        import patch_agentlab
        debug_print(f"[ray_worker_init] Imported patch_agentlab in PID {os.getpid()}")
        
        # 确保 benchmark.acidwave 已导入
        import benchmark.acidwave
        debug_print(f"[ray_worker_init] Registered {len(benchmark.acidwave.ALL_ACIDWAVE_TASK_IDS)} Acidwave tasks in Ray worker (PID {os.getpid()})")
        
        # 验证注册
        import gymnasium as gym
        registry = gym.envs.registry
        acidwave_tasks = [env_id for env_id in registry if 'acidwave' in env_id]
        debug_print(f"[ray_worker_init] Verified {len(acidwave_tasks)} acidwave tasks in Gymnasium registry")
        
        if not acidwave_tasks:
            print(f"[ray_worker_init] WARNING: No acidwave tasks found in registry!")
            debug_print(f"[ray_worker_init] Available namespaces: {set(env_id.split('/')[0] for env_id in registry if '/' in env_id)}")
        
    except Exception as e:
        print(f"[ray_worker_init] ERROR during initialization: {e}")
        import traceback
        traceback.print_exc()
        raise


# 自动执行初始化（当此模块被导入时）
init_ray_worker()

