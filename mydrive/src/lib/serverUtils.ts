
export function getUniqueName(name: string, existingNames: Set<string>): string {
    if (!existingNames.has(name)) {
        return name;
    }

    // Split into base and extension
    // Be careful with dotfiles or no extension
    let base = name;
    let ext = "";

    const lastDotIndex = name.lastIndexOf(".");
    // If dot is at start (hidden file) or not found, treat whole thing as base
    if (lastDotIndex > 0) {
        base = name.substring(0, lastDotIndex);
        ext = name.substring(lastDotIndex);
    }

    let counter = 1;
    while (true) {
        const candidate = `${base}(${counter})${ext}`;
        if (!existingNames.has(candidate)) {
            return candidate;
        }
        counter++;
    }
}
