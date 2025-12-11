/**
 * AMD transformation module for converting ES6 modules to Moodle AMD format
 * 
 * @copyright  2025 Digitech
 * @license    MIT
 */

const fs = require('fs');

/**
 * AMD transformer class for converting various module formats to Moodle AMD
 */
class AmdTransformer {
    constructor(logger) {
        this.logger = logger;
    }
    
    /**
     * Creates a Rollup plugin for Moodle AMD transformation
     * 
     * @param {string} inputFilePath - Path to the input file
     * @param {Object} options - Transformation options
     * @returns {Object} Rollup plugin
     */
    createRollupPlugin(inputFilePath, options = {}) {
        const transformer = this;
        
        return {
            name: 'moodle-amd-transformer',
            
            generateBundle(rollupOptions, bundle) {
                for (const fileName in bundle) {
                    const chunk = bundle[fileName];
                    if (chunk.type === 'chunk') {
                        try {
                            const amdId = rollupOptions.amd?.id || 'unknown';
                            chunk.code = transformer.transformToAmd(
                                chunk.code, 
                                amdId, 
                                inputFilePath,
                                options
                            );
                        } catch (error) {
                            transformer.logger.error(`AMD transformation failed for ${fileName}: ${error.message}`);
                            throw error;
                        }
                    }
                }
            }
        };
    }
    
    /**
     * Transforms code to AMD format
     * 
     * @param {string} code - Source code to transform
     * @param {string} moduleId - AMD module ID
     * @param {string} inputFilePath - Original file path
     * @param {Object} options - Transformation options
     * @returns {string} Transformed AMD code
     */
    transformToAmd(code, moduleId, inputFilePath, options = {}) {
        // Read original source to check if it's already AMD
        const originalCode = this.readOriginalSource(inputFilePath);
        const existingAmdMatch = this.detectExistingAmd(originalCode);
        
        if (existingAmdMatch) {
            return this.transformExistingAmd(existingAmdMatch, moduleId, options);
        }
        
        return this.transformEsModuleToAmd(code, moduleId, options);
    }
    
    /**
     * Reads the original source file
     * 
     * @param {string} filePath - Path to source file
     * @returns {string} File content or empty string if read fails
     */
    readOriginalSource(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            this.logger.warn(`Could not read original source ${filePath}: ${error.message}`);
            return '';
        }
    }
    
    /**
     * Detects existing AMD format in source code
     * 
     * @param {string} code - Source code
     * @returns {Object|null} Match object with AMD parts or null
     */
    detectExistingAmd(code) {
        // Enhanced regex to handle various AMD patterns
        const patterns = [
            // Standard AMD with dependencies array
            /define\s*\(\s*(\[[\s\S]*?\])\s*,\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/,
            // AMD with string dependencies
            /define\s*\(\s*['"`]([^'"`]*?)['"`]\s*,\s*(\[[\s\S]*?\])\s*,\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/,
            // Simple AMD without dependencies
            /define\s*\(\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/
        ];
        
        for (const pattern of patterns) {
            const match = code.match(pattern);
            if (match) {
                return this.parseAmdMatch(match);
            }
        }
        
        return null;
    }
    
    /**
     * Parses AMD regex match into structured data
     * 
     * @param {Array} match - Regex match array
     * @returns {Object} Parsed AMD structure
     */
    parseAmdMatch(match) {
        // Different match structures based on pattern
        if (match.length === 4) {
            // Pattern 1: define([deps], function(params) {body})
            return {
                dependencies: match[1],
                params: match[2] || '',
                body: match[3]
            };
        } else if (match.length === 5) {
            // Pattern 2: define("name", [deps], function(params) {body})
            return {
                name: match[1],
                dependencies: match[2],
                params: match[3] || '',
                body: match[4]
            };
        } else if (match.length === 3) {
            // Pattern 3: define(function(params) {body})
            return {
                dependencies: '[]',
                params: match[1] || '',
                body: match[2]
            };
        }
        
        return null;
    }
    
    /**
     * Transforms existing AMD format by adding module ID
     * 
     * @param {Object} amdMatch - Parsed AMD structure
     * @param {string} moduleId - New module ID
     * @param {Object} options - Transformation options
     * @returns {string} Transformed AMD code
     */
    transformExistingAmd(amdMatch, moduleId, options = {}) {
        let dependencies;
        
        try {
            dependencies = this.parseDependencies(amdMatch.dependencies);
        } catch (error) {
            this.logger.warn(`Failed to parse dependencies: ${error.message}`);
            dependencies = [];
        }
        
        const body = amdMatch.body.trim();
        const params = amdMatch.params || '';
        
        return this.formatAmdModule(moduleId, dependencies, params, body, options);
    }
    
    /**
     * Transforms ES6 module to AMD format
     * 
     * @param {string} code - ES6 module code
     * @param {string} moduleId - AMD module ID
     * @param {Object} options - Transformation options
     * @returns {string} AMD module code
     */
    transformEsModuleToAmd(code, moduleId, options = {}) {
        const dependencies = this.extractDependencies(code);
        const transformedCode = this.transformEsModuleCode(code, dependencies);
        const params = this.generateParameters(dependencies);
        
        return this.formatAmdModule(moduleId, dependencies, params, transformedCode, options);
    }
    
    /**
     * Extracts dependencies from ES6 import statements
     * 
     * @param {string} code - ES6 module code
     * @returns {Array} Array of dependency strings
     */
    extractDependencies(code) {
        const dependencies = [];
        
        // Extract from import statements
        const importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = importRegex.exec(code)) !== null) {
            const dep = match[1];
            if (!dependencies.includes(dep)) {
                dependencies.push(dep);
            }
        }
        
        // Extract from require() calls
        const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = requireRegex.exec(code)) !== null) {
            const dep = match[1];
            if (!dependencies.includes(dep)) {
                dependencies.push(dep);
            }
        }
        
        return dependencies;
    }
    
    /**
     * Transforms ES6 module code by removing import/export statements
     * 
     * @param {string} code - Original ES6 code
     * @param {Array} dependencies - List of dependencies
     * @returns {string} Transformed code
     */
    transformEsModuleCode(code, dependencies) {
        let transformedCode = code;
        
        // Remove import statements
        transformedCode = transformedCode.replace(
            /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"`][^'"`]+['"`];?\s*/g, 
            ''
        );
        
        // Remove export statements but keep the exported code
        transformedCode = transformedCode.replace(/export\s+(?:default\s+)?/g, '');
        
        // Replace require calls with parameter references
        dependencies.forEach((dep, index) => {
            const paramName = `dep${index}`;
            const requirePattern = new RegExp(
                `require\\s*\\(\\s*['"\`]${this.escapeRegex(dep)}['"\`]\\s*\\)`, 
                'g'
            );
            transformedCode = transformedCode.replace(requirePattern, paramName);
        });
        
        // Remove IIFE wrapper if present
        transformedCode = transformedCode.replace(/^\s*\(function\s*\([^)]*\)\s*\{/, '');
        transformedCode = transformedCode.replace(/\}\s*\([^)]*\)\s*\);\s*$/, '');
        
        return transformedCode.trim();
    }
    
    /**
     * Generates parameter names for AMD function
     * 
     * @param {Array} dependencies - Dependency array
     * @returns {string} Comma-separated parameter names
     */
    generateParameters(dependencies) {
        return dependencies.map((_, index) => `dep${index}`).join(', ');
    }
    
    /**
     * Parses dependency array string into array
     * 
     * @param {string} dependenciesStr - String representation of dependencies
     * @returns {Array} Parsed dependencies
     */
    parseDependencies(dependenciesStr) {
        if (!dependenciesStr) return [];
        
        try {
            // Clean up for JSON parsing
            const cleanDepsStr = dependenciesStr
                .replace(/'/g, '"') // Convert single quotes to double quotes
                .replace(/,\s*]/g, ']') // Remove trailing commas
                .replace(/\s+/g, ' '); // Normalize whitespace
                
            return JSON.parse(cleanDepsStr);
        } catch (error) {
            // Fallback: extract manually using regex
            const depMatches = dependenciesStr.match(/['"`]([^'"`]+)['"`]/g);
            if (depMatches) {
                return depMatches.map(dep => dep.slice(1, -1));
            }
            
            this.logger.warn(`Could not parse dependencies: ${dependenciesStr}`);
            return [];
        }
    }
    
    /**
     * Formats the final AMD module
     * 
     * @param {string} moduleId - Module ID
     * @param {Array} dependencies - Dependencies array
     * @param {string} params - Function parameters
     * @param {string} body - Function body
     * @param {Object} options - Formatting options
     * @returns {string} Formatted AMD module
     */
    formatAmdModule(moduleId, dependencies, params, body, options = {}) {
        const { 
            indentSize = 4,
            addSourceComment = false 
        } = options;
        
        const indent = ' '.repeat(indentSize);
        let formattedBody = body;
        
        // Add indentation to body if needed
        if (options.indentBody !== false) {
            formattedBody = body
                .split('\n')
                .map(line => line ? indent + line : line)
                .join('\n');
        }
        
        let result = `define("${moduleId}", ${JSON.stringify(dependencies)}, function(${params}) {\n`;
        
        if (addSourceComment) {
            result += `${indent}// Transformed from ES6 module\n`;
        }
        
        result += formattedBody;
        result += '\n});';
        
        return result;
    }
    
    /**
     * Escapes special regex characters in a string
     * 
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    /**
     * Validates AMD module syntax
     * 
     * @param {string} amdCode - AMD code to validate
     * @returns {boolean} True if valid AMD syntax
     */
    isValidAmd(amdCode) {
        try {
            // Basic validation - check for define function call
            return /define\s*\(\s*["'][^"']*["']\s*,\s*\[.*?\]\s*,\s*function\s*\([^)]*\)\s*\{[\s\S]*\}\s*\)\s*;?\s*$/.test(amdCode.trim());
        } catch (error) {
            return false;
        }
    }
}

module.exports = {
    AmdTransformer
};