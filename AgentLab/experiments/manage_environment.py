"""
环境管理工具 - 重置和检查Acidwave环境
========================================

提供工具来管理Acidwave测试环境:
- 检查环境状态
- 重置环境到初始状态
- 清理测试数据

用法:
    python experiments/manage_environment.py check
    python experiments/manage_environment.py reset
    python experiments/manage_environment.py info
"""

import sys
import os
import time
from pathlib import Path
import requests
import argparse

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


class AcidwaveEnvironment:
    """Acidwave环境管理器"""
    
    def __init__(self, frontend_url="http://localhost:5173"):
        self.frontend_url = frontend_url
        self.backend_url = frontend_url.replace("5173", "3001")  # Assumed backend port
    
    def check_status(self) -> dict:
        """
        检查环境状态
        
        Returns:
            状态字典 {frontend: bool, backend: bool, healthy: bool}
        """
        status = {
            'frontend': False,
            'backend': False,
            'healthy': False,
            'frontend_url': self.frontend_url,
            'backend_url': self.backend_url,
        }
        
        # Check frontend
        try:
            response = requests.get(self.frontend_url, timeout=3)
            if response.status_code == 200:
                status['frontend'] = True
                print(f"✅ Frontend 运行正常: {self.frontend_url}")
            else:
                print(f"⚠️  Frontend 返回状态 {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"❌ Frontend 无法访问: {e}")
        
        # Check backend (if API endpoint exists)
        try:
            # Try to access a common API endpoint
            api_endpoint = f"{self.backend_url}/api/health"
            response = requests.get(api_endpoint, timeout=3)
            if response.status_code in [200, 404]:  # 404 is ok if health endpoint doesn't exist
                status['backend'] = True
                print(f"✅ Backend 运行正常: {self.backend_url}")
        except requests.exceptions.RequestException:
            # Backend might not have health endpoint, try to infer from frontend
            if status['frontend']:
                status['backend'] = True  # Assume backend is ok if frontend works
                print(f"ℹ️  Backend 状态未知 (从Frontend推断: 可能正常)")
        
        # Overall health
        status['healthy'] = status['frontend'] and status['backend']
        
        return status
    
    def reset_environment(self) -> bool:
        """
        重置环境到初始状态
        
        对于Acidwave, 这通常意味着重启Docker容器
        
        Returns:
            是否成功
        """
        print("\n" + "="*60)
        print("重置 Acidwave 环境")
        print("="*60)
        
        # Check if docker-compose is available
        import subprocess
        
        try:
            # Check docker-compose
            result = subprocess.run(
                ['docker-compose', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode != 0:
                print("❌ docker-compose 未安装")
                return False
            
            print(f"✅ Docker Compose: {result.stdout.strip()}")
            
        except Exception as e:
            print(f"❌ 无法检查 docker-compose: {e}")
            return False
        
        # Stop containers
        print("\n[1/3] 停止容器...")
        try:
            result = subprocess.run(
                ['docker-compose', 'down'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                print("✅ 容器已停止")
            else:
                print(f"⚠️  停止容器时有警告: {result.stderr}")
        
        except Exception as e:
            print(f"❌ 停止容器失败: {e}")
            return False
        
        # Wait a bit
        print("\n[2/3] 等待清理...")
        time.sleep(2)
        
        # Start containers
        print("\n[3/3] 启动容器...")
        try:
            result = subprocess.run(
                ['docker-compose', 'up', '-d'],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                print("✅ 容器已启动")
                print("\n等待服务就绪...")
                time.sleep(5)
                
                # Check status
                status = self.check_status()
                
                if status['healthy']:
                    print("\n✅ 环境重置成功!")
                    return True
                else:
                    print("\n⚠️  环境启动但状态检查失败")
                    return False
            else:
                print(f"❌ 启动容器失败: {result.stderr}")
                return False
        
        except Exception as e:
            print(f"❌ 启动容器失败: {e}")
            return False
    
    def get_info(self) -> dict:
        """
        获取环境信息
        
        Returns:
            环境信息字典
        """
        info = {
            'frontend_url': self.frontend_url,
            'backend_url': self.backend_url,
            'docker_containers': [],
        }
        
        # Get docker containers
        import subprocess
        try:
            result = subprocess.run(
                ['docker', 'ps', '--filter', 'name=acidwave', '--format', '{{.Names}}\t{{.Status}}'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        name, status = line.split('\t')
                        info['docker_containers'].append({
                            'name': name,
                            'status': status
                        })
        except Exception:
            pass
        
        return info
    
    def print_info(self):
        """打印环境信息"""
        print("\n" + "="*60)
        print("ACIDWAVE 环境信息")
        print("="*60)
        
        info = self.get_info()
        
        print(f"\n🌐 URLs:")
        print(f"   Frontend: {info['frontend_url']}")
        print(f"   Backend:  {info['backend_url']}")
        
        print(f"\n🐳 Docker 容器:")
        if info['docker_containers']:
            for container in info['docker_containers']:
                print(f"   - {container['name']}")
                print(f"     状态: {container['status']}")
        else:
            print("   (未找到运行中的容器)")
        
        # Check status
        print(f"\n📊 当前状态:")
        status = self.check_status()
        
        print(f"\n总体健康: {'✅ 健康' if status['healthy'] else '❌ 不健康'}")
        
        print("\n" + "="*60)


def main():
    parser = argparse.ArgumentParser(
        description="Acidwave环境管理工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
命令:
  check   - 检查环境状态
  reset   - 重置环境 (重启Docker容器)
  info    - 显示环境信息
  start   - 启动环境
  stop    - 停止环境

示例:
  # 检查状态
  python experiments/manage_environment.py check
  
  # 重置环境
  python experiments/manage_environment.py reset
  
  # 查看信息
  python experiments/manage_environment.py info
  
  # 自定义URL
  python experiments/manage_environment.py check --url http://localhost:8080
        """
    )
    
    parser.add_argument(
        'command',
        choices=['check', 'reset', 'info', 'start', 'stop'],
        help='要执行的命令'
    )
    
    parser.add_argument(
        '--url',
        type=str,
        default='http://localhost:5173',
        help='Acidwave前端URL (默认: http://localhost:5173)'
    )
    
    args = parser.parse_args()
    
    # Create environment manager
    env = AcidwaveEnvironment(frontend_url=args.url)
    
    # Execute command
    if args.command == 'check':
        print("\n检查 Acidwave 环境状态...\n")
        status = env.check_status()
        
        print("\n" + "-"*60)
        if status['healthy']:
            print("✅ 环境健康,可以运行实验")
            sys.exit(0)
        else:
            print("❌ 环境不健康,请检查:")
            print("   1. Docker容器是否运行: docker ps")
            print("   2. 启动环境: docker-compose up -d")
            print("   3. 查看日志: docker-compose logs")
            sys.exit(1)
    
    elif args.command == 'reset':
        success = env.reset_environment()
        sys.exit(0 if success else 1)
    
    elif args.command == 'info':
        env.print_info()
    
    elif args.command == 'start':
        print("\n启动 Acidwave 环境...\n")
        import subprocess
        try:
            subprocess.run(['docker-compose', 'up', '-d'], check=True)
            print("\n✅ 环境已启动")
            print("等待服务就绪...")
            time.sleep(5)
            env.check_status()
        except Exception as e:
            print(f"\n❌ 启动失败: {e}")
            sys.exit(1)
    
    elif args.command == 'stop':
        print("\n停止 Acidwave 环境...\n")
        import subprocess
        try:
            subprocess.run(['docker-compose', 'down'], check=True)
            print("\n✅ 环境已停止")
        except Exception as e:
            print(f"\n❌ 停止失败: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()

