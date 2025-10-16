#!/usr/bin/env node

/**
 * Moodle AMD Bundler CLI
 * Usage: npx moodle-pack
 * * This script automatically finds the Moodle root directory 
 * by searching upwards from the current execution path.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { rollup } = require('rollup');
const terser = require('@rollup/plugin-terser');
const os = require('os');

// Custom AMD plugin to match Moodle's exact format
function moodleAmdPlugin(inputFilePath) {
    return {
        name: 'moodle-amd',
        
        // Transform the final output
        generateBundle(options, bundle) {
            for (const fileName in bundle) {
                const chunk = bundle[fileName];
                if (chunk.type === 'chunk') {
                    const amdId = options.amd?.id || 'unknown';
                    
                    // Read the original source file to check for AMD format
                    let originalCode;
                    try {
                        originalCode = fs.readFileSync(inputFilePath, 'utf8');
                    } catch (e) {
                        originalCode = '';
                    }
                    
                    // Check if the original source is in AMD format
                    const amdDefineMatch = originalCode.match(/define\s*\(\s*(\[[\s\S]*?\])\s*,\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/);
                    
                    if (amdDefineMatch) {
                        // Handle existing AMD format from original source
                        const dependenciesStr = amdDefineMatch[1];
                        const params = amdDefineMatch[2] || '';
                        let moduleBody = amdDefineMatch[3];
                        
                        // Parse dependencies array - handle both single and multi-line arrays
                        let dependencies;
                        try {
                            // Clean up the dependencies string for proper JSON parsing
                            const cleanDepsStr = dependenciesStr
                                .replace(/'/g, '"') // Convert single quotes to double quotes
                                .replace(/,\s*]/g, ']') // Remove trailing commas
                                .replace(/\s+/g, ' '); // Normalize whitespace
                            dependencies = JSON.parse(cleanDepsStr);
                        } catch (e) {
                            // If JSON parsing fails, try to extract dependencies manually
                            const depMatches = dependenciesStr.match(/['"`]([^'"`]+)['"`]/g);
                            if (depMatches) {
                                dependencies = depMatches.map(dep => dep.slice(1, -1));
                            } else {
                                dependencies = [];
                            }
                        }
                        
                        // Clean up the module body and remove any extra whitespace
                        moduleBody = moduleBody.trim();
                        
                        // Create the new define with module name, preserving original structure
                        chunk.code = `define("${amdId}", ${JSON.stringify(dependencies)}, function(${params}) {
${moduleBody}
});`;
                    } else {
                        // Handle ES6 modules or other formats
                        let code = chunk.code;
                        const dependencies = [];
                        
                        // Extract dependencies from import statements
                        const importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
                        let match;
                        while ((match = importRegex.exec(code)) !== null) {
                            const dep = match[1];
                            if (!dependencies.includes(dep)) {
                                dependencies.push(dep);
                            }
                        }
                        
                        // Also check for require() calls
                        const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
                        while ((match = requireRegex.exec(code)) !== null) {
                            const dep = match[1];
                            if (!dependencies.includes(dep)) {
                                dependencies.push(dep);
                            }
                        }
                        
                        // Remove import/export statements
                        code = code.replace(/import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"`][^'"`]+['"`];?\s*/g, '');
                        code = code.replace(/export\s+(?:default\s+)?/g, '');
                        
                        // Replace require calls with parameter references
                        dependencies.forEach((dep, index) => {
                            const paramName = `dep${index}`;
                            const requirePattern = new RegExp(`require\\s*\\(\\s*['"\`]${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*\\)`, 'g');
                            code = code.replace(requirePattern, paramName);
                        });
                        
                        // Create parameter list
                        const params = dependencies.map((dep, index) => `dep${index}`).join(', ');
                        
                        // Remove IIFE wrapper if present
                        code = code.replace(/^\s*\(function\s*\([^)]*\)\s*\{/, '');
                        code = code.replace(/\}\s*\([^)]*\)\s*\);\s*$/, '');
                        
                        // Create the final AMD module
                        chunk.code = `define("${amdId}", ${JSON.stringify(dependencies)}, function(${params}) {
${code.trim()}
});`;
                    }
                }
            }
        }
    };
}

// --- Global State & Configuration ---
let MOODLE_ROOT = null; // Dynamically set to the detected Moodle root directory.
const CONCURRENCY_LIMIT = Math.max(1, os.cpus().length);

// --- Core Helper: Moodle Root Finder ---

/**
 * Traverses parent directories up to the filesystem root to locate the Moodle installation.
 * It looks for typical Moodle files like 'version.php', 'config-dist.php', or 'lib/components.json'.
 * * @param {string} startDir The directory to start searching from (usually process.cwd()).
 * @returns {string|null} The path to the Moodle root directory, or null if not found.
 */
function findMoodleRoot(startDir) {
    let currentDir = startDir;
    while (currentDir !== path.parse(currentDir).root) {
        // Look for reliable Moodle root indicators
        if (fs.existsSync(path.join(currentDir, 'version.php')) &&
            fs.existsSync(path.join(currentDir, 'config-dist.php'))) {
            return currentDir;
        }
        if (fs.existsSync(path.join(currentDir, 'lib', 'components.json'))) {
             return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // Reached the filesystem root
        currentDir = parentDir;
    }
    return null;
}

// --- Component Name Resolver ---

/**
 * Helper: Load Moodle component definitions.
 * Logic adapted from component.js to map directories to 'Frankenstyle' names.
 */
let componentCache = null;

function getComponentMap() {
    if (componentCache) return componentCache;

    // Use MOODLE_ROOT instead of CWD to find components.json
    const componentsFile = path.join(MOODLE_ROOT, 'lib', 'components.json');
    const subsystems = {};
    const modules = {};

    if (fs.existsSync(componentsFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(componentsFile, 'utf8'));
            
            // Map Subsystems (e.g., "lib/access" -> "core_access")
            for (const [name, dir] of Object.entries(data.subsystems)) {
                if (dir) subsystems[dir] = `core_${name}`;
            }
            subsystems['public/lib'] = 'core'; 
            subsystems['lib'] = 'core';
            
            // Map Plugins (e.g., "mod/forum" -> "mod_forum")
            for (const [type, dir] of Object.entries(data.plugintypes)) {
                modules[dir] = type;
            }
            
            componentCache = { subsystems, plugintypes: modules };
        } catch (e) {
            // Fail silently and fall back to guessing if not in a valid Moodle root
        }
    }

    return componentCache || { subsystems: {}, plugintypes: {} };
}

/**
 * Helper: Determine module name from file path.
 */
function getMoodleModuleName(filePath) {
    // Calculate path relative to the discovered Moodle root
    const relativePath = path.relative(MOODLE_ROOT, filePath).replace(/\\/g, '/');
    const parts = relativePath.split('/');
    
    // Find where 'amd/src' is located
    const amdIndex = parts.indexOf('amd');
    if (amdIndex === -1 || parts[amdIndex + 1] !== 'src') {
        // This case should not be reached if globbing is correct, but is a safe guard.
        throw new Error(`Invalid Moodle AMD path: ${relativePath}`);
    }

    const componentPath = parts.slice(0, amdIndex).join('/');
    const fileParts = parts.slice(amdIndex + 2); // Everything after amd/src
    
    // Remove .js extension from the last part
    const fileName = fileParts.join('/').replace(/\.js$/, '');

    // Resolve Component Name (using component mapping logic)
    const map = getComponentMap();
    let componentName = '';

    if (map.subsystems[componentPath]) {
        componentName = map.subsystems[componentPath];
    } else {
        let found = false;
        for (const [pluginRoot, type] of Object.entries(map.plugintypes)) {
            if (componentPath.startsWith(pluginRoot + '/')) {
                const pluginName = componentPath.substring(pluginRoot.length + 1);
                componentName = `${type}_${pluginName}`;
                found = true;
                break;
            }
        }
        
        // Fallback guessing
        if (!found) {
            componentName = componentPath.replace(/\//g, '_');
            if (componentName === 'lib') componentName = 'core';
        }
    }

    return `${componentName}/${fileName}`;
}



// --- Rollup Builder ---

async function buildFile(filePath) {
    let moduleName;
    try {
        moduleName = getMoodleModuleName(filePath);
    } catch (e) {
        return; // Skip non-compliant files
    }

    // Determine Output Path relative to Moodle Root
    // amd/src/file.js -> amd/build/file.min.js
    const relativePath = path.relative(MOODLE_ROOT, filePath);
    const destPath = relativePath
        .replace(/\\/g, '/')
        .replace('amd/src', 'amd/build')
        .replace('.js', '.min.js');

    const fullDest = path.join(MOODLE_ROOT, destPath);
    const outputDir = path.dirname(fullDest);
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        const bundle = await rollup({
            input: filePath,
            plugins: [
                moodleAmdPlugin(filePath),
                terser({
                    mangle: false,
                    compress: {
                        sequences: false,
                        properties: true,
                        dead_code: true,
                        drop_debugger: true,
                        unsafe: false,
                        unsafe_comps: false,
                        conditionals: true,
                        comparisons: true,
                        evaluate: true,
                        booleans: true,
                        loops: true,
                        unused: true,
                        hoist_funs: false,
                        keep_fargs: true,
                        hoist_vars: false,
                        if_return: true,
                        join_vars: true,
                        side_effects: true,
                        warnings: false,
                        global_defs: {}
                    },
                    output: {
                        comments: false,
                        beautify: false
                    }
                })
            ]
        });

        await bundle.write({
            file: fullDest,
            format: 'iife', // Use IIFE format to avoid AMD conflicts
            name: 'temp', // Temporary name, will be replaced by our plugin
            amd: {
                id: moduleName
            },
            sourcemap: true
        });

        console.log(`✓ ${moduleName}`);
    } catch (error) {
        console.error(`X ${moduleName}: ${error.message}`);
    }
}

// --- Main Execution ---

async function main() {
    MOODLE_ROOT = findMoodleRoot(process.cwd());

    if (!MOODLE_ROOT) {
        console.error("❌ Error: Could not find the Moodle root directory. Please run this command from within a Moodle installation.");
        return;
    }
    
    console.log(`✅ Moodle Root detected: ${MOODLE_ROOT}`);
    console.log(`Scanning for JS files...`);

    // Glob pattern matching Moodle's Grunt setup, searching from the MOODLE_ROOT
    const files = glob.sync('**/amd/src/**/*.js', {
        ignore: ['**/node_modules/**', '**/output/**'],
        cwd: process.cwd(),
        absolute: true
    });

    if (files.length === 0) {
        console.log("No AMD source files found to process.");
        return;
    }

    console.log(`Found ${files.length} files. Starting build with concurrency ${CONCURRENCY_LIMIT}...`);

    // Chunking helper to manage concurrency
    const chunk = (arr, size) => 
        Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
            arr.slice(i * size, i * size + size)
        );

    const batches = chunk(files, CONCURRENCY_LIMIT);

    for (const batch of batches) {
        await Promise.all(batch.map(file => buildFile(file)));
    }
    
    console.log('\n✨ Build complete.');
}

main();
