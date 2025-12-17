"""
结果分析工具 - WebArena风格报告
=================================

分析实验结果并生成详细的性能报告，包括：
- 按难度分组的成功率
- 失败任务分析
- 步数统计
- 可视化图表

用法:
    python experiments/analyze_results.py <result_dir>
    python experiments/analyze_results.py results/2025-12-13_18-00-00_*
"""

import sys
import json
from pathlib import Path
import pandas as pd
from typing import Dict, List, Optional
import argparse

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def load_experiment_results(result_dir: Path) -> Optional[pd.DataFrame]:
    """
    加载实验结果
    
    Args:
        result_dir: 结果目录路径
        
    Returns:
        DataFrame with results or None if not found
    """
    try:
        from agentlab.analyze import inspect_results
        df = inspect_results.load_result_df(result_dir)
        return df
    except Exception as e:
        print(f"❌ 无法加载结果: {e}")
        return None


def load_task_metadata(task_ids: List[int]) -> Dict:
    """
    加载任务元数据
    
    Args:
        task_ids: 任务ID列表
        
    Returns:
        Dict mapping task_id to task config
    """
    from benchmark.acidwave import AcidwaveBenchmark
    
    benchmark = AcidwaveBenchmark()
    task_map = {}
    
    for task in benchmark._tasks:
        task_map[task["task_id"]] = task
    
    return task_map


def extract_task_id(task_name: str) -> int:
    """从task_name提取task_id"""
    try:
        # Format: acidwave.task_<ID>
        return int(task_name.split("_")[-1])
    except:
        return -1


def analyze_by_difficulty(df: pd.DataFrame, task_map: Dict) -> pd.DataFrame:
    """按难度分组分析"""
    
    # Add task metadata
    df['task_id'] = df['task_name'].apply(extract_task_id)
    df['difficulty'] = df['task_id'].apply(
        lambda tid: task_map.get(tid, {}).get('difficulty', 'unknown')
    )
    df['intent'] = df['task_id'].apply(
        lambda tid: task_map.get(tid, {}).get('intent', 'Unknown')
    )
    
    # Calculate success (reward > 0.8)
    df['success'] = df['cum_reward'] > 0.8
    
    # Group by difficulty
    difficulty_stats = []
    
    for diff in ['easy', 'medium', 'hard']:
        diff_tasks = df[df['difficulty'] == diff]
        if len(diff_tasks) == 0:
            continue
        
        stats = {
            'difficulty': diff,
            'total': len(diff_tasks),
            'success': diff_tasks['success'].sum(),
            'success_rate': diff_tasks['success'].mean() * 100,
            'avg_reward': diff_tasks['cum_reward'].mean(),
            'avg_steps': diff_tasks['n_steps'].mean(),
        }
        difficulty_stats.append(stats)
    
    return pd.DataFrame(difficulty_stats)


def analyze_failures(df: pd.DataFrame, task_map: Dict) -> List[Dict]:
    """分析失败任务"""
    
    # Add metadata
    df['task_id'] = df['task_name'].apply(extract_task_id)
    df['difficulty'] = df['task_id'].apply(
        lambda tid: task_map.get(tid, {}).get('difficulty', 'unknown')
    )
    df['intent'] = df['task_id'].apply(
        lambda tid: task_map.get(tid, {}).get('intent', 'Unknown')
    )
    
    # Find failures (reward <= 0.8)
    failures = df[df['cum_reward'] <= 0.8].copy()
    
    failure_list = []
    for _, row in failures.iterrows():
        failure_list.append({
            'task_id': row['task_id'],
            'task_name': row['task_name'],
            'difficulty': row['difficulty'],
            'intent': row['intent'],
            'reward': row['cum_reward'],
            'steps': row['n_steps'],
            'error': row.get('err_msg', 'No error message'),
        })
    
    return failure_list


def analyze_step_efficiency(df: pd.DataFrame, task_map: Dict) -> pd.DataFrame:
    """分析步数效率"""
    
    df['task_id'] = df['task_name'].apply(extract_task_id)
    df['difficulty'] = df['task_id'].apply(
        lambda tid: task_map.get(tid, {}).get('difficulty', 'unknown')
    )
    df['success'] = df['cum_reward'] > 0.8
    
    # Only analyze successful tasks
    success_df = df[df['success']].copy()
    
    if len(success_df) == 0:
        return pd.DataFrame()
    
    # Group by difficulty
    step_stats = []
    for diff in ['easy', 'medium', 'hard']:
        diff_tasks = success_df[success_df['difficulty'] == diff]
        if len(diff_tasks) == 0:
            continue
        
        stats = {
            'difficulty': diff,
            'avg_steps': diff_tasks['n_steps'].mean(),
            'min_steps': diff_tasks['n_steps'].min(),
            'max_steps': diff_tasks['n_steps'].max(),
            'std_steps': diff_tasks['n_steps'].std(),
        }
        step_stats.append(stats)
    
    return pd.DataFrame(step_stats)


def generate_report(result_dir: Path, output_file: Optional[Path] = None):
    """
    生成完整分析报告
    
    Args:
        result_dir: 结果目录
        output_file: 输出文件路径 (None = 打印到控制台)
    """
    
    print("\n" + "="*80)
    print("ACIDWAVE 实验结果分析")
    print("="*80)
    print(f"\n📁 结果目录: {result_dir}")
    
    # Load results
    print("\n[1/5] 加载实验数据...")
    df = load_experiment_results(result_dir)
    
    if df is None:
        print("❌ 无法加载结果")
        return
    
    print(f"   ✅ 加载了 {len(df)} 个任务的结果")
    
    # Load task metadata
    print("\n[2/5] 加载任务元数据...")
    task_ids = df['task_name'].apply(extract_task_id).tolist()
    task_map = load_task_metadata(task_ids)
    print(f"   ✅ 加载了 {len(task_map)} 个任务的元数据")
    
    # Overall statistics
    print("\n[3/5] 计算整体统计...")
    total = len(df)
    success_count = (df['cum_reward'] > 0.8).sum()
    partial_count = ((df['cum_reward'] > 0.3) & (df['cum_reward'] <= 0.8)).sum()
    fail_count = (df['cum_reward'] <= 0.3).sum()
    success_rate = (success_count / total * 100) if total > 0 else 0
    
    avg_reward = df['cum_reward'].mean()
    avg_steps = df['n_steps'].mean()
    
    # Difficulty analysis
    print("\n[4/5] 按难度分析...")
    difficulty_df = analyze_by_difficulty(df, task_map)
    
    # Failure analysis
    print("\n[5/5] 分析失败任务...")
    failures = analyze_failures(df, task_map)
    
    # Step efficiency
    step_efficiency_df = analyze_step_efficiency(df, task_map)
    
    # ==========================================
    # Generate Report
    # ==========================================
    
    report_lines = []
    
    def add_line(text=""):
        report_lines.append(text)
        print(text)
    
    add_line("\n" + "="*80)
    add_line("实验结果详细报告")
    add_line("="*80)
    add_line(f"\n📊 总体表现")
    add_line("-" * 80)
    add_line(f"总任务数:      {total}")
    add_line(f"成功任务:      {success_count:2d} ({success_rate:5.1f}%)")
    add_line(f"部分完成:      {partial_count:2d}")
    add_line(f"失败任务:      {fail_count:2d}")
    add_line(f"平均得分:      {avg_reward:.3f}")
    add_line(f"平均步数:      {avg_steps:.1f}")
    
    # Difficulty breakdown
    add_line(f"\n📈 按难度分组")
    add_line("-" * 80)
    add_line(f"{'难度':<10} {'总数':<6} {'成功':<6} {'成功率':<10} {'平均分':<10} {'平均步数':<10}")
    add_line("-" * 80)
    
    for _, row in difficulty_df.iterrows():
        add_line(
            f"{row['difficulty']:<10} "
            f"{row['total']:<6.0f} "
            f"{row['success']:<6.0f} "
            f"{row['success_rate']:<10.1f}% "
            f"{row['avg_reward']:<10.3f} "
            f"{row['avg_steps']:<10.1f}"
        )
    
    # Step efficiency for successful tasks
    if len(step_efficiency_df) > 0:
        add_line(f"\n⚡ 步数效率 (仅成功任务)")
        add_line("-" * 80)
        add_line(f"{'难度':<10} {'平均':<8} {'最少':<8} {'最多':<8} {'标准差':<8}")
        add_line("-" * 80)
        
        for _, row in step_efficiency_df.iterrows():
            add_line(
                f"{row['difficulty']:<10} "
                f"{row['avg_steps']:<8.1f} "
                f"{row['min_steps']:<8.0f} "
                f"{row['max_steps']:<8.0f} "
                f"{row['std_steps']:<8.2f}"
            )
    
    # Failed tasks
    if failures:
        add_line(f"\n❌ 失败任务详情 ({len(failures)}个)")
        add_line("-" * 80)
        
        for i, failure in enumerate(failures, 1):
            add_line(f"\n{i}. 任务 {failure['task_id']} ({failure['difficulty']})")
            add_line(f"   目标: {failure['intent'][:70]}")
            add_line(f"   得分: {failure['reward']:.3f}")
            add_line(f"   步数: {failure['steps']}")
            if failure['error'] and failure['error'] != 'No error message':
                add_line(f"   错误: {failure['error'][:100]}")
    
    # Recommendations
    add_line(f"\n💡 改进建议")
    add_line("-" * 80)
    
    if success_rate < 50:
        add_line("⚠️  成功率较低 (<50%), 建议:")
        add_line("   1. 检查agent提示词是否清晰")
        add_line("   2. 增加max_steps (当前可能不够)")
        add_line("   3. 使用ACIDWAVE_REASONING_AGENT")
        add_line("   4. 检查Acidwave应用是否正常运行")
        add_line("   5. 查看失败任务的截图和日志")
    elif success_rate < 80:
        add_line("🔶 成功率中等 (50-80%), 建议:")
        add_line("   1. 针对失败任务优化提示词")
        add_line("   2. 调整temperature参数")
        add_line("   3. 改进任务验证逻辑")
        add_line("   4. 分析失败模式 (是否集中在某个难度?)")
    else:
        add_line("✅ 成功率优秀 (>80%)!")
        add_line("   可以尝试:")
        add_line("   1. 优化步数效率 (减少冗余操作)")
        add_line("   2. 增加更具挑战性的任务")
        add_line("   3. 测试其他模型 (GPT-4o-mini)")
        add_line("   4. 进行消融实验 (ablation study)")
    
    # Next steps
    add_line(f"\n🚀 下一步行动")
    add_line("-" * 80)
    add_line(f"1. 查看详细日志:")
    add_line(f"   cd {result_dir}")
    add_line(f"   ls */experiment.log")
    add_line(f"\n2. 查看失败任务截图:")
    add_line(f"   cd {result_dir}")
    for failure in failures[:3]:  # Show first 3
        task_name = failure['task_name']
        add_line(f"   ls *{task_name}*/screenshot_*.png")
    
    add_line(f"\n3. 使用AgentXray可视化:")
    add_line(f"   agentlab-xray")
    
    add_line("\n" + "="*80)
    
    # Save to file
    if output_file:
        output_file = Path(output_file)
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(report_lines))
        print(f"\n✅ 报告已保存到: {output_file}")
    else:
        # Save to default location
        default_output = result_dir / "analysis_report.txt"
        with open(default_output, 'w', encoding='utf-8') as f:
            f.write('\n'.join(report_lines))
        print(f"\n✅ 报告已保存到: {default_output}")


def main():
    parser = argparse.ArgumentParser(
        description="分析Acidwave实验结果 (WebArena风格)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 分析最新结果
  python experiments/analyze_results.py results/2025-12-13_18-00-00_full_experiment
  
  # 指定输出文件
  python experiments/analyze_results.py results/<dir> -o my_report.txt
  
  # 分析多个实验 (需要手动运行多次)
  python experiments/analyze_results.py results/experiment1
  python experiments/analyze_results.py results/experiment2
        """
    )
    
    parser.add_argument(
        'result_dir',
        type=str,
        help='实验结果目录路径'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        help='输出报告文件路径 (默认: <result_dir>/analysis_report.txt)'
    )
    
    args = parser.parse_args()
    
    result_dir = Path(args.result_dir)
    
    if not result_dir.exists():
        print(f"❌ 目录不存在: {result_dir}")
        sys.exit(1)
    
    generate_report(result_dir, args.output)


if __name__ == "__main__":
    main()



