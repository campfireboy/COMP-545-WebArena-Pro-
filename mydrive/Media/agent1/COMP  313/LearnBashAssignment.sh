#!/bin/bash

########################################
# System Monitoring and File Analysis
# Author: Student Submission
########################################

LOG_FILE="system_report.log"

########################################
# Helper: Print and Log
########################################
log() {
    echo "$1" | tee -a "$LOG_FILE"
}

########################################
# Part 1: Argument Validation
########################################

if [ $# -ne 1 ]; then
    echo "Usage: $0 <directory_path>"
    exit 1
fi

TARGET_DIR="$1"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory does not exist."
    exit 1
fi

# Clear previous log
> "$LOG_FILE"

log "===== SYSTEM REPORT ====="
log "Directory: $TARGET_DIR"
log "Generated at: $(date)"
log ""

########################################
# Part 2: Directory Analysis
########################################

log "---- Directory Analysis ----"

FILE_COUNT=$(find "$TARGET_DIR" -type f | wc -l)
DIR_COUNT=$(find "$TARGET_DIR" -type d | wc -l)

log "Total Files: $FILE_COUNT"
log "Total Subdirectories: $DIR_COUNT"

# Largest File
LARGEST_FILE=$(find "$TARGET_DIR" -type f -exec ls -S {} + 2>/dev/null | head -n 1)
SMALLEST_FILE=$(find "$TARGET_DIR" -type f -exec ls -Sr {} + 2>/dev/null | head -n 1)

log "Largest File: $LARGEST_FILE"
log "Smallest File: $SMALLEST_FILE"

# Disk Usage
DISK_USAGE=$(du -sh "$TARGET_DIR" | cut -f1)
log "Total Disk Usage: $DISK_USAGE"

log ""

########################################
# Part 3: Text File Processing
########################################

log "---- Text File Analysis ----"

TXT_FILES=$(find "$TARGET_DIR" -type f -name "*.txt")
TXT_COUNT=$(echo "$TXT_FILES" | grep -c ".txt")

log "Total .txt Files: $TXT_COUNT"

TOTAL_LINES=0

if [ "$TXT_COUNT" -gt 0 ]; then

    TOTAL_LINES=$(cat $TXT_FILES 2>/dev/null | wc -l)
    log "Total Lines in .txt Files: $TOTAL_LINES"

    # Most common word
    COMMON_WORD=$(cat $TXT_FILES 2>/dev/null \
        | tr -cs '[:alnum:]' '\n' \
        | tr '[:upper:]' '[:lower:]' \
        | sort \
        | uniq -c \
        | sort -nr \
        | head -n 1)

    log "Most Common Word: $COMMON_WORD"

else
    log "No .txt files found."
fi

log ""

########################################
# Part 4: Process Monitoring
########################################

log "---- Top CPU Processes ----"
ps -eo pid,comm,%cpu --sort=-%cpu | head -n 6 | tee -a "$LOG_FILE"

log ""

log "---- Top Memory Processes ----"
ps -eo pid,comm,%mem --sort=-%mem | head -n 6 | tee -a "$LOG_FILE"

log ""

########################################
# Completion Message
########################################

log "===== END OF REPORT ====="
