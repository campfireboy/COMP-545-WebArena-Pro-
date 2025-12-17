
import sys
import logging
from browsergym.core.registration import register_task
import gymnasium as gym
import patch_agentlab  # Patches environment

logging.basicConfig(level=logging.INFO)

def run_mydrive_test():
    print("Running MyDrive Basic Test...")
    # Initialize Ray/AgentLab environment
    
    # Run a simple loop manually or via AgentLab
    # For quick verification, we'll just instantiate the environment
    
    # Debug: List all mydrive envs
    all_envs = list(gym.envs.registry.keys())
    mydrive_envs = [e for e in all_envs if "mydrive" in e.lower()]
    print(f"Found {len(mydrive_envs)} mydrive environments: {mydrive_envs}")
    
    if mydrive_envs:
        env_id = mydrive_envs[0]
    else:
        # Fallback to what we expect
        env_id = "browsergym/mydrive.task_0"
        
    print(f"Creating environment: {env_id}")
    
    try:
        env = gym.make(env_id)
        obs, info = env.reset()
        print("Environment created successfully!")
        print(f"Initial observation keys: {obs.keys()}")
        print(f"Goal: {obs['goal']}")
        
        # Taking a no-op step
        action = "noop()"
        obs, reward, terminated, truncated, info = env.step(action)
        print(f"Step result: reward={reward}, done={terminated or truncated}")
        
        env.close()
        print("\n✅ MyDrive integration verification PASSED")
        
    except Exception as e:
        print(f"\n❌ MyDrive integration verification FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_mydrive_test()
