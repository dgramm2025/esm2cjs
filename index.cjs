#!/usr/bin/env node

/**
 * ESM2CJS - Moodle AMD Module Bundler CLI
 * 
 * A modern, modular tool for converting ES6 modules to Moodle AMD format.
 * Automatically detects Moodle root and processes all AMD source files.
 * 
 * Usage: npx esm2cjs [options]
 * 
 * @copyright  2025 Digitech
 * @license    MIT
 */

// Import modular components
const { findMoodleRoot, Logger, CONFIG } = require('./src/utils');
const { FileProcessor } = require('./src/file-processor');

/**
 * Parses command line arguments
 * 
 * @returns {Object} Parsed CLI options
 */
function parseCliArgs() {
    const args = process.argv.slice(2);
    const options = {
        verbose: false,
        help: false,
        version: false,
        concurrency: CONFIG.CONCURRENCY_LIMIT,
        minify: true,
        sourcemap: true
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '-v':
            case '--verbose':
                options.verbose = true;
                break;
                
            case '-h':
            case '--help':
                options.help = true;
                break;
                
            case '--version':
                options.version = true;
                break;
                
            case '-c':
            case '--concurrency':
                const concurrency = parseInt(args[++i], 10);
                if (!isNaN(concurrency) && concurrency > 0) {
                    options.concurrency = concurrency;
                } else {
                    throw new Error('Invalid concurrency value. Must be a positive integer.');
                }
                break;
                
            case '--no-minify':
                options.minify = false;
                break;
                
            case '--no-sourcemap':
                options.sourcemap = false;
                break;
                
            default:
                if (arg.startsWith('-')) {
                    throw new Error(`Unknown option: ${arg}`);
                }
                break;
        }
    }
    
    return options;
}

/**
 * Shows CLI help information
 */
function showHelp() {
    console.log(`
ESM2CJS - Moodle AMD Module Bundler

Usage: npx esm2cjs [options]

Options:
  -v, --verbose         Enable verbose logging
  -h, --help            Show this help message
  --version             Show version information
  -c, --concurrency N   Set build concurrency (default: ${CONFIG.CONCURRENCY_LIMIT})
  --no-minify           Skip minification
  --no-sourcemap        Skip source map generation

Examples:
  npx esm2cjs                    # Build all AMD modules
  npx esm2cjs --verbose          # Build with detailed logging
  npx esm2cjs -c 4               # Build with 4 concurrent processes
  npx esm2cjs --no-minify        # Build without minification

This tool automatically detects your Moodle installation root and processes
all AMD source files found in */amd/src/ directories.
`);
}

/**
 * Shows version information
 */
function showVersion() {
    try {
        const packageJson = require('./package.json');
        console.log(`ESM2CJS v${packageJson.version}`);
    } catch (error) {
        console.log('ESM2CJS (version unknown)');
    }
}

/**
 * Main execution function
 */
async function main() {
    let options;
    let logger;
    
    try {
        // Parse CLI arguments
        options = parseCliArgs();
        
        // Create logger
        logger = new Logger(options.verbose);
        
        // Handle help and version flags
        if (options.help) {
            showHelp();
            return;
        }
        
        if (options.version) {
            showVersion();
            return;
        }
        
        logger.info('🚀 ESM2CJS - Moodle AMD Module Bundler');
        logger.debug('CLI options:', options);
        
        // Find Moodle root
        const moodleRoot = findMoodleRoot(process.cwd());
        
        if (!moodleRoot) {
            logger.error('Could not find Moodle root directory.');
            logger.info('Please run this command from within a Moodle installation.');
            logger.info('Looking for: version.php, config-dist.php, or lib/components.json');
            process.exit(1);
        }
        
        logger.success(`Moodle root detected: ${moodleRoot}`);
        
        // Initialize file processor
        const fileProcessor = new FileProcessor(moodleRoot, logger);
        
        // Find AMD source files
        logger.info('🔍 Scanning for AMD source files...');
        const files = fileProcessor.findAmdSourceFiles();
        
        if (files.length === 0) {
            logger.warn('No AMD source files found to process.');
            logger.info('Expected to find files matching: **/amd/src/**/*.js');
            return;
        }
        
        logger.info(`📦 Processing ${files.length} files with concurrency ${options.concurrency}`);
        
        // Process files
        const results = await fileProcessor.processMultipleFiles(files, {
            concurrency: options.concurrency,
            minify: options.minify,
            sourcemap: options.sourcemap,
            showProgress: !options.verbose, // Show progress bar only if not verbose
            transformOptions: {
                indentSize: 4,
                addSourceComment: options.verbose
            }
        });
        
        // Handle results
        const stats = fileProcessor.getStats();
        
        if (stats.failed > 0) {
            logger.error(`Build completed with ${stats.failed} errors.`);
            
            if (options.verbose) {
                logger.info('\nFailed files:');
                results
                    .filter(r => !r.success)
                    .forEach(r => logger.error(`  ${r.filePath}: ${r.error.message}`));
            }
            
            process.exit(1);
        } else {
            logger.success('✨ Build completed successfully!');
        }
        
    } catch (error) {
        if (logger) {
            logger.error(`Fatal error: ${error.message}`);
        } else {
            console.error(`❌ Fatal error: ${error.message}`);
        }
        
        if (options && options.verbose) {
            console.error(error.stack);
        }
        
        process.exit(1);
    }
}

// Run the main function
main();
