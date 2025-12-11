/**
 * Utility functions for ESM2CJS tool
 * 
 * @copyright  2025 Digitech
 * @license    MIT
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Configuration constants
 */
const CONFIG = {
    CONCURRENCY_LIMIT: Math.max(1, os.cpus().length),
    MOODLE_FILES: ['version.php', 'config-dist.php'],
    MOODLE_LIB_FILES: ['lib/components.json'],
    AMD_PATTERNS: {
        SRC: '**/amd/src/**/*.js',
        IGNORE: ['**/node_modules/**', '**/output/**', '**/build/**']
    }
};

/**
 * Traverses parent directories to locate the Moodle installation root.
 * Looks for typical Moodle files like 'version.php', 'config-dist.php', or 'lib/components.json'.
 * 
 * @param {string} startDir - The directory to start searching from
 * @returns {string|null} The path to the Moodle root directory, or null if not found
 */
function findMoodleRoot(startDir) {
    let currentDir = path.resolve(startDir);
    const rootDir = path.parse(currentDir).root;
    
    while (currentDir !== rootDir) {
        // Check for reliable Moodle root indicators
        const hasVersionAndConfig = CONFIG.MOODLE_FILES.every(file => 
            fs.existsSync(path.join(currentDir, file))
        );
        
        if (hasVersionAndConfig) {
            return currentDir;
        }
        
        // Check for lib/components.json as alternative indicator
        const hasComponentsFile = CONFIG.MOODLE_LIB_FILES.some(file =>
            fs.existsSync(path.join(currentDir, file))
        );
        
        if (hasComponentsFile) {
            return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // Reached filesystem root
        currentDir = parentDir;
    }
    
    return null;
}

/**
 * Normalizes file paths for cross-platform compatibility
 * 
 * @param {string} filePath - The file path to normalize
 * @returns {string} Normalized path with forward slashes
 */
function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
}

/**
 * Ensures a directory exists, creating it recursively if needed
 * 
 * @param {string} dirPath - The directory path to ensure
 */
function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Safely reads and parses a JSON file
 * 
 * @param {string} filePath - Path to the JSON file
 * @returns {Object|null} Parsed JSON object or null if file doesn't exist/invalid
 */
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`Warning: Failed to read/parse JSON file ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * Chunks an array into smaller arrays of specified size
 * 
 * @param {Array} array - Array to chunk
 * @param {number} size - Size of each chunk
 * @returns {Array[]} Array of chunks
 */
function chunkArray(array, size) {
    return Array.from(
        { length: Math.ceil(array.length / size) }, 
        (_, i) => array.slice(i * size, i * size + size)
    );
}

/**
 * Validates that a file path follows Moodle AMD structure
 * 
 * @param {string} filePath - The file path to validate
 * @returns {boolean} True if path is valid Moodle AMD structure
 */
function isValidMoodleAmdPath(filePath) {
    const normalizedPath = normalizePath(filePath);
    const parts = normalizedPath.split('/');
    const amdIndex = parts.indexOf('amd');
    
    return amdIndex !== -1 && 
           parts[amdIndex + 1] === 'src' && 
           parts[amdIndex + 2] && 
           filePath.endsWith('.js');
}

/**
 * Gets the relative path from Moodle root, ensuring it's normalized
 * 
 * @param {string} moodleRoot - The Moodle root directory
 * @param {string} filePath - The file path
 * @returns {string} Normalized relative path
 */
function getRelativePathFromRoot(moodleRoot, filePath) {
    return normalizePath(path.relative(moodleRoot, filePath));
}

/**
 * Logger utility with different levels
 */
class Logger {
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    
    info(message) {
        console.log(`ℹ️  ${message}`);
    }
    
    success(message) {
        console.log(`✅ ${message}`);
    }
    
    error(message) {
        console.error(`❌ ${message}`);
    }
    
    warn(message) {
        console.warn(`⚠️  ${message}`);
    }
    
    debug(message) {
        if (this.verbose) {
            console.log(`🔍 ${message}`);
        }
    }
    
    progress(current, total, item = '') {
        const percentage = Math.round((current / total) * 100);
        const bar = '█'.repeat(Math.floor(percentage / 4)) + '░'.repeat(25 - Math.floor(percentage / 4));
        process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total}) ${item}`);
        if (current === total) {
            process.stdout.write('\n');
        }
    }
}

module.exports = {
    CONFIG,
    findMoodleRoot,
    normalizePath,
    ensureDirectory,
    readJsonFile,
    chunkArray,
    isValidMoodleAmdPath,
    getRelativePathFromRoot,
    Logger
};