/**
 * File processor module for handling Moodle AMD builds
 * 
 * @copyright  2025 Digitech
 * @license    MIT
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { rollup } = require('rollup');
const terser = require('@rollup/plugin-terser');

const { 
    ensureDirectory, 
    getRelativePathFromRoot, 
    isValidMoodleAmdPath,
    CONFIG
} = require('./utils');
const { ComponentResolver } = require('./component-resolver');
const { AmdTransformer } = require('./amd-transformer');

/**
 * File processor class for building Moodle AMD modules
 */
class FileProcessor {
    constructor(moodleRoot, logger) {
        this.moodleRoot = moodleRoot;
        this.logger = logger;
        this.componentResolver = new ComponentResolver(moodleRoot);
        this.amdTransformer = new AmdTransformer(logger);
        this.stats = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0
        };
    }
    
    /**
     * Finds all AMD source files in the Moodle installation
     * 
     * @param {Object} options - Search options
     * @returns {Array} Array of file paths
     */
    findAmdSourceFiles(options = {}) {
        const {
            patterns = [CONFIG.AMD_PATTERNS.SRC],
            ignore = CONFIG.AMD_PATTERNS.IGNORE,
            cwd = process.cwd()
        } = options;
        
        this.logger.debug(`Searching for AMD files with patterns: ${patterns.join(', ')}`);
        
        const allFiles = [];
        
        for (const pattern of patterns) {
            const files = glob.sync(pattern, {
                ignore,
                cwd,
                absolute: true
            });
            
            // Filter for valid Moodle AMD paths
            const validFiles = files.filter(file => {
                if (!isValidMoodleAmdPath(file)) {
                    this.logger.debug(`Skipping invalid AMD path: ${file}`);
                    return false;
                }
                return true;
            });
            
            allFiles.push(...validFiles);
        }
        
        // Remove duplicates
        const uniqueFiles = [...new Set(allFiles)];
        
        this.logger.info(`Found ${uniqueFiles.length} AMD source files`);
        return uniqueFiles;
    }
    
    /**
     * Processes a single AMD file
     * 
     * @param {string} filePath - Path to the source file
     * @param {Object} options - Processing options
     * @returns {Object} Result object with success status and details
     */
    async processSingleFile(filePath, options = {}) {
        const result = {
            success: false,
            filePath,
            moduleName: null,
            outputPath: null,
            error: null
        };
        
        try {
            // Resolve module name
            result.moduleName = this.componentResolver.getModuleNameFromPath(filePath);
            
            // Determine output path
            result.outputPath = this.getOutputPath(filePath);
            
            // Ensure output directory exists
            ensureDirectory(path.dirname(result.outputPath));
            
            // Build the file
            await this.buildFile(filePath, result.moduleName, result.outputPath, options);
            
            result.success = true;
            this.stats.succeeded++;
            
            this.logger.debug(`✓ ${result.moduleName}`);
            
        } catch (error) {
            result.error = error;
            this.stats.failed++;
            
            this.logger.error(`✗ ${result.moduleName || path.basename(filePath)}: ${error.message}`);
        }
        
        this.stats.processed++;
        return result;
    }
    
    /**
     * Processes multiple AMD files with concurrency control
     * 
     * @param {Array} filePaths - Array of file paths to process
     * @param {Object} options - Processing options
     * @returns {Array} Array of result objects
     */
    async processMultipleFiles(filePaths, options = {}) {
        const { 
            concurrency = CONFIG.CONCURRENCY_LIMIT,
            showProgress = true 
        } = options;
        
        this.resetStats();
        
        if (filePaths.length === 0) {
            this.logger.warn('No files to process');
            return [];
        }
        
        this.logger.info(`Processing ${filePaths.length} files with concurrency ${concurrency}`);
        
        const results = [];
        
        // Process files in batches
        const { chunkArray } = require('./utils');
        const batches = chunkArray(filePaths, concurrency);
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            
            if (showProgress) {
                this.logger.progress(i * concurrency, filePaths.length, `Processing batch ${i + 1}/${batches.length}`);
            }
            
            // Process batch in parallel
            const batchResults = await Promise.all(
                batch.map(filePath => this.processSingleFile(filePath, options))
            );
            
            results.push(...batchResults);
        }
        
        if (showProgress) {
            this.logger.progress(filePaths.length, filePaths.length, 'Complete');
        }
        
        this.logSummary();
        
        return results;
    }
    
    /**
     * Gets the output path for a source file
     * 
     * @param {string} sourcePath - Source file path
     * @returns {string} Output file path
     */
    getOutputPath(sourcePath) {
        const relativePath = getRelativePathFromRoot(this.moodleRoot, sourcePath);
        
        // Convert amd/src/file.js -> amd/build/file.min.js
        const outputRelativePath = relativePath
            .replace('amd/src', 'amd/build')
            .replace('.js', '.min.js');
            
        return path.join(this.moodleRoot, outputRelativePath);
    }
    
    /**
     * Builds a single file using Rollup
     * 
     * @param {string} inputPath - Input file path
     * @param {string} moduleName - AMD module name
     * @param {string} outputPath - Output file path
     * @param {Object} options - Build options
     */
    async buildFile(inputPath, moduleName, outputPath, options = {}) {
        const {
            minify = true,
            sourcemap = true,
            transformOptions = {}
        } = options;
        
        const plugins = [
            this.amdTransformer.createRollupPlugin(inputPath, transformOptions)
        ];
        
        if (minify) {
            const minifyOptions = {
                enableMangle: options.enableMangle !== false,
                preserveAmdStructure: options.preserveAmdStructure !== false
            };
            plugins.push(this.createTerserPlugin(minifyOptions));
        }
        
        try {
            const bundle = await rollup({
                input: inputPath,
                plugins,
                onwarn: (warning) => {
                    // Filter out common warnings that are not relevant for AMD builds
                    if (warning.code === 'CIRCULAR_DEPENDENCY' || 
                        warning.code === 'UNUSED_EXTERNAL_IMPORT') {
                        return;
                    }
                    this.logger.warn(`Rollup warning in ${inputPath}: ${warning.message}`);
                }
            });
            
            await bundle.write({
                file: outputPath,
                format: 'iife', // IIFE format to avoid AMD conflicts during transformation
                name: 'temp', // Temporary name, replaced by transformer
                amd: {
                    id: moduleName
                },
                sourcemap
            });
            
            await bundle.close();
            
        } catch (error) {
            throw new Error(`Rollup build failed: ${error.message}`);
        }
    }
    
    /**
     * Creates Terser plugin for minification
     * 
     * @param {Object} options - Minification options
     * @returns {Object} Terser plugin configuration
     */
    createTerserPlugin(options = {}) {
        const {
            enableMangle = true,
            preserveAmdStructure = true
        } = options;
        
        return terser({
            // Enable name mangling for smaller files, but preserve AMD function parameters
            mangle: enableMangle ? {
                // Keep AMD define function parameters readable
                reserved: ['define', 'require', 'module', 'exports'],
                // Don't mangle top-level function parameters (AMD callback params)
                toplevel: false
            } : false,
            
            compress: {
                // Enable sequence optimization for better minification
                sequences: true,
                properties: true,
                dead_code: true,
                drop_console: false, // Keep console statements for debugging
                drop_debugger: true,
                unsafe: false,
                unsafe_comps: false,
                unsafe_math: false,
                unsafe_symbols: false,
                unsafe_methods: false,
                unsafe_proto: false,
                unsafe_regexp: false,
                conditionals: true,
                comparisons: true,
                evaluate: true,
                booleans: true,
                typeofs: true,
                loops: true,
                unused: true,
                toplevel: false, // Don't optimize top-level scope (preserve AMD structure)
                top_retain: preserveAmdStructure ? ['define'] : null,
                hoist_funs: false,
                hoist_props: true,
                hoist_vars: false,
                if_return: true,
                inline: true,
                join_vars: true,
                reduce_vars: true,
                reduce_funcs: true,
                collapse_vars: true,
                side_effects: true,
                pure_getters: false,
                keep_fargs: false, // Remove unused function arguments
                keep_fnames: false, // Remove function names when possible
                passes: 2, // Run compression twice for better results
                warnings: false,
                global_defs: {}
            },
            
            format: {
                comments: false, // Remove all comments
                beautify: false, // Minify output
                semicolons: true, // Always use semicolons
                wrap_iife: false, // Don't wrap in extra parentheses
                preserve_annotations: false // Remove JSDoc annotations
            }
        });
    }
    
    /**
     * Validates that a file can be processed
     * 
     * @param {string} filePath - File path to validate
     * @returns {Object} Validation result
     */
    validateFile(filePath) {
        const result = {
            valid: false,
            errors: [],
            warnings: []
        };
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            result.errors.push(`File does not exist: ${filePath}`);
            return result;
        }
        
        // Check if it's a valid Moodle AMD path
        if (!isValidMoodleAmdPath(filePath)) {
            result.errors.push(`Invalid Moodle AMD path structure: ${filePath}`);
            return result;
        }
        
        // Check if file is readable
        try {
            fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            result.errors.push(`File is not readable: ${error.message}`);
            return result;
        }
        
        // Try to resolve component name
        try {
            this.componentResolver.getModuleNameFromPath(filePath);
        } catch (error) {
            result.errors.push(`Cannot resolve module name: ${error.message}`);
            return result;
        }
        
        result.valid = true;
        return result;
    }
    
    /**
     * Resets processing statistics
     */
    resetStats() {
        this.stats = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0
        };
    }
    
    /**
     * Gets current processing statistics
     * 
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * Logs processing summary
     */
    logSummary() {
        const { processed, succeeded, failed, skipped } = this.stats;
        
        this.logger.info('\n📊 Build Summary:');
        this.logger.success(`  ✅ Succeeded: ${succeeded}`);
        
        if (failed > 0) {
            this.logger.error(`  ❌ Failed: ${failed}`);
        }
        
        if (skipped > 0) {
            this.logger.warn(`  ⏭️  Skipped: ${skipped}`);
        }
        
        this.logger.info(`  📁 Total processed: ${processed}`);
        
        if (failed > 0) {
            this.logger.warn('\nSome files failed to build. Check the error messages above for details.');
        }
    }
}

module.exports = {
    FileProcessor
};