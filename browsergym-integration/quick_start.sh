#!/bin/bash
# Quick Start Script for Acidwave Testing
# ==========================================

set -e

echo ""
echo "================================================================"
echo "  ACIDWAVE Testing Framework - Quick Start"
echo "================================================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python not found!"
    echo "Please install Python 3.10+ and try again."
    exit 1
fi

# Check if in correct directory
if [ ! -f "experiments/run_quick_test.py" ]; then
    echo "[ERROR] Not in correct directory!"
    echo "Please run this script from the browsergym-integration folder."
    exit 1
fi

while true; do
    echo ""
    echo "Choose an option:"
    echo ""
    echo "  [1] Check Environment Status"
    echo "  [2] Basic Test (3 tasks, ~3 min)"
    echo "  [3] Quick Test - Easy (5 tasks, ~8 min)"
    echo "  [4] Quick Test - Medium (6 tasks, ~12 min)"
    echo "  [5] Quick Test - Hard (5 tasks, ~15 min)"
    echo "  [6] Full Experiment (16 tasks, ~40 min)"
    echo "  [7] Analyze Latest Results"
    echo "  [8] Reset Environment"
    echo "  [9] View Usage Guide"
    echo "  [10] Verify MyDrive Integration"
    echo "  [0] Exit"
    echo ""
    
    read -p "Enter your choice (0-9): " choice
    
    case $choice in
        0)
            echo ""
            echo "Thanks for using Acidwave Testing Framework!"
            echo ""
            exit 0
            ;;
        1)
            echo ""
            echo "[1/1] Checking environment..."
            python3 experiments/manage_environment.py check
            read -p "Press Enter to continue..."
            ;;
        2)
            echo ""
            echo "[INFO] Running basic test (3 tasks)..."
            echo "This will take about 2-3 minutes."
            echo ""
            read -p "Show browser window? (y/n, default=n): " vis
            if [ "$vis" = "y" ]; then
                python3 experiments/run_basic_test.py
            else
                python3 experiments/run_basic_test.py --headless
            fi
            read -p "Press Enter to continue..."
            ;;
        3)
            echo ""
            echo "[INFO] Running quick test - EASY (5 tasks)..."
            echo "This will take about 5-8 minutes."
            echo ""
            read -p "Show browser window? (y/n, default=n): " vis
            if [ "$vis" = "y" ]; then
                python3 experiments/run_quick_test.py easy --no-headless
            else
                python3 experiments/run_quick_test.py easy
            fi
            read -p "Press Enter to continue..."
            ;;
        4)
            echo ""
            echo "[INFO] Running quick test - MEDIUM (6 tasks)..."
            echo "This will take about 8-12 minutes."
            echo ""
            read -p "Show browser window? (y/n, default=n): " vis
            if [ "$vis" = "y" ]; then
                python3 experiments/run_quick_test.py medium --no-headless
            else
                python3 experiments/run_quick_test.py medium
            fi
            read -p "Press Enter to continue..."
            ;;
        5)
            echo ""
            echo "[INFO] Running quick test - HARD (5 tasks)..."
            echo "This will take about 10-15 minutes."
            echo ""
            read -p "Show browser window? (y/n, default=n): " vis
            if [ "$vis" = "y" ]; then
                python3 experiments/run_quick_test.py hard --no-headless
            else
                python3 experiments/run_quick_test.py hard
            fi
            read -p "Press Enter to continue..."
            ;;
        6)
            echo ""
            echo "[INFO] Running FULL experiment (16 tasks)..."
            echo "This will take about 25-40 minutes."
            echo ""
            read -p "Press Ctrl+C to cancel, or Enter to continue..."
            
            read -p "Show browser window? (y/n, default=n): " vis
            if [ "$vis" = "y" ]; then
                python3 experiments/run_full_experiments.py --no-headless
            else
                python3 experiments/run_full_experiments.py
            fi
            read -p "Press Enter to continue..."
            ;;
        7)
            echo ""
            echo "[INFO] Analyzing latest results..."
            echo ""
            
            # Find latest result directory
            latest=$(ls -t results/ 2>/dev/null | head -n1)
            
            if [ -z "$latest" ]; then
                echo "[ERROR] No results found!"
                echo "Please run an experiment first."
                read -p "Press Enter to continue..."
                continue
            fi
            
            echo "Latest: results/$latest"
            echo ""
            python3 experiments/analyze_results.py "results/$latest"
            
            echo ""
            echo "View full report:"
            echo "  cat results/$latest/analysis_report.txt"
            read -p "Press Enter to continue..."
            ;;
        8)
            echo ""
            echo "[WARNING] This will restart the Docker containers!"
            echo "All current state will be lost."
            echo ""
            read -p "Continue? (y/n): " confirm
            if [ "$confirm" != "y" ]; then
                continue
            fi
            
            python3 experiments/manage_environment.py reset
            read -p "Press Enter to continue..."
            ;;
        9)
            echo ""
            echo "Opening usage guide..."
            if command -v xdg-open &> /dev/null; then
                xdg-open COMPLETE_USAGE_GUIDE.md
            elif command -v open &> /dev/null; then
                open COMPLETE_USAGE_GUIDE.md
            else
                cat COMPLETE_USAGE_GUIDE.md
            fi
            read -p "Press Enter to continue..."
            ;;
        10)
            echo ""
            echo "[INFO] Verifying MyDrive Integration..."
            echo ""
            python3 experiments/verify_mydrive.py
            read -p "Press Enter to continue..."
            ;;
        *)
            echo "Invalid choice! Please try again."
            ;;
    esac
done





