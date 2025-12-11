# ESM2CJS

A modern, modular tool for converting ES6 modules to Moodle AMD format.

## Overview

ESM2CJS is a complete refactor and modernization of the original Moodle AMD bundling process. It replaces the legacy Babel plugin approach with a streamlined Rollup-based architecture that's more maintainable, performant, and feature-rich.

## Features

- ✅ **Automatic Moodle Detection**: Finds your Moodle root directory automatically
- ✅ **ES6 → AMD Conversion**: Transforms modern JavaScript to Moodle AMD format  
- ✅ **Component Resolution**: Maps file paths to proper Moodle component names
- ✅ **Modular Architecture**: Well-organized, testable codebase
- ✅ **Enhanced Logging**: Detailed progress reporting and error handling
- ✅ **Concurrent Processing**: Fast parallel builds with configurable concurrency
- ✅ **Source Maps**: Optional source map generation for debugging
- ✅ **Minification**: Optimized output with Terser
- ✅ **CLI Interface**: Rich command-line interface with multiple options

## Installation

```bash
# Option 1: Direct from GitHub (no npm account needed)
git clone https://github.com/dgramm2025/esm2cjs.git
cd esm2cjs
npm install
npm install -g .

# Option 2: When published to npm
npm install -g esm2cjs-moodle
```

Or use with npx (when published):

```bash
npx esm2cjs-moodle
```

## Usage

### Basic Usage

Run from within any Moodle installation:

```bash
esm2cjs-moodle
```

The tool will automatically:
1. Detect your Moodle root directory
2. Find all AMD source files (`**/amd/src/**/*.js`)
3. Transform them to proper AMD format
4. Output minified files to `**/amd/build/**/*.min.js`

### CLI Options

```bash
esm2cjs-moodle [options]

Options:
  -v, --verbose         Enable verbose logging
  -h, --help            Show help message
  --version             Show version information
  -c, --concurrency N   Set build concurrency (default: CPU cores)
  --no-minify           Skip minification
  --no-sourcemap        Skip source map generation
```

### Examples

```bash
# Build with detailed logging
esm2cjs-moodle --verbose

# Build with custom concurrency
esm2cjs-moodle --concurrency 8

# Build without minification (for debugging)
esm2cjs-moodle --no-minify --verbose

# Show help
esm2cjs-moodle --help
```

## Architecture

The refactored codebase is organized into focused, modular components:

### Core Modules

- **`src/utils.js`** - Common utilities (file operations, logging, configuration)
- **`src/component-resolver.js`** - Moodle component name resolution  
- **`src/amd-transformer.js`** - ES6 → AMD transformation logic
- **`src/file-processor.js`** - File processing and build orchestration
- **`index.cjs`** - CLI interface and main execution

### Key Improvements Over Legacy Code

| Aspect | Legacy (Babel Plugin) | New (Modular Rollup) |
|--------|----------------------|----------------------|
| **Architecture** | Monolithic Babel plugin | Modular, testable components |
| **Performance** | Single-threaded | Concurrent processing |
| **Error Handling** | Basic console output | Comprehensive logging & recovery |
| **Maintainability** | Tightly coupled code | Separation of concerns |
| **Testing** | Difficult to test | Each module independently testable |
| **CLI** | Basic execution | Rich CLI with multiple options |
| **Dependencies** | Required `.grunt/components.js` | Reads `lib/components.json` directly |

## Component Resolution

The tool automatically resolves Moodle component names from file paths:

```javascript
// Examples:
lib/amd/src/modal.js              → core/modal
mod/forum/amd/src/discussion.js   → mod_forum/discussion
theme/boost/amd/src/drawer.js     → theme_boost/drawer
```

Component mapping uses Moodle's standard `lib/components.json` file and follows the Frankenstyle naming convention.

## Transformation Process

1. **File Discovery**: Scans for `**/amd/src/**/*.js` files
2. **Validation**: Ensures files follow Moodle AMD structure
3. **Component Resolution**: Maps file paths to component names
4. **Code Transformation**:
   - Detects existing AMD vs ES6 modules
   - Extracts dependencies from import statements
   - Converts ES6 syntax to AMD format
   - Preserves existing AMD structure when present
5. **Bundling**: Uses Rollup for optimized builds
6. **Minification**: Applies Terser with AMD-friendly settings
7. **Output**: Writes to `**/amd/build/**/*.min.js`

## Migration from Legacy

If you're migrating from the old Babel plugin approach:

1. **Remove**: `babel-plugin-add-module-to-define.js`
2. **Install**: This package (`esm2cjs-moodle`)
3. **Update**: Build scripts to use `esm2cjs-moodle` command
4. **Verify**: Component resolution matches your expectations

The new tool is designed to be a drop-in replacement with enhanced capabilities.

## Development

### Project Structure
```
src/
├── utils.js              # Utilities and configuration
├── component-resolver.js # Moodle component name resolution
├── amd-transformer.js    # ES6 → AMD transformation
└── file-processor.js     # Build orchestration

index.cjs                 # CLI interface
package.json
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.0.0 (Major Refactor)
- ✅ Complete architecture overhaul
- ✅ Modular, testable components
- ✅ Enhanced CLI interface
- ✅ Improved error handling and logging
- ✅ Concurrent processing support
- ✅ Better ES6 module support
- ✅ Removed dependency on `.grunt/components.js`
- ✅ Direct `lib/components.json` integration