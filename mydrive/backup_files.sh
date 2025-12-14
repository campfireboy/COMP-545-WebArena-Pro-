#!/bin/bash

# Create the PROJECTCOPYS directory if it doesn't exist
mkdir -p PROJECTCOPYS

# Find and copy all route.ts files
echo "Copying route.ts files..."
find . -type f -name "route.ts" | while read -r file; do
    # Get the relative path
    rel_path="${file#./}"
    # Create the directory structure in PROJECTCOPYS
    target_dir="PROJECTCOPYS/$(dirname "$rel_path")"
    mkdir -p "$target_dir"
    # Copy the file
    cp "$file" "$target_dir/"
    echo "Copied: $file -> $target_dir/route.ts"
done

# Find and copy all page.tsx files
echo "Copying page.tsx files..."
find . -type f -name "page.tsx" | while read -r file; do
    # Get the relative path
    rel_path="${file#./}"
    # Create the directory structure in PROJECTCOPYS
    target_dir="PROJECTCOPYS/$(dirname "$rel_path")"
    mkdir -p "$target_dir"
    # Copy the file
    cp "$file" "$target_dir/"
    echo "Copied: $file -> $target_dir/page.tsx"
done

echo ""
echo "Backup complete! All files copied to PROJECTCOPYS/"
echo "Total files copied: $(find PROJECTCOPYS -type f | wc -l)"