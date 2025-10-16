// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * This is a Rollup plugin to add the Moodle module names to the AMD modules
 * as part of the build process.
 *
 * In addition it will also add a return statement for the default export if the
 * module is using default exports. This is a highly specific Moodle thing because
 * we're building to AMD and need to handle default exports correctly.
 *
 * This will fix the issue where an ES6 module using "export default Foo" will be
 * transpiled into an AMD module that returns {default: Foo}; Instead it will now
 * just simply return Foo.
 *
 * Note: This means all other named exports in that module are ignored and won't be
 * exported.
 *
 * @copyright  2025 Converted from Babel plugin by GitHub Copilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import fs from 'fs';
import path from 'path';

/**
 * Get the path to lib/components.json
 *
 * @returns {string}
 */
function getComponentsFilePath() {
    // Always from the current working directory
    if (fs.existsSync('lib/components.json')) {
        return path.resolve('lib/components.json');
    } else if (fs.existsSync('../lib/components.json')) {
        return path.resolve('../lib/components.json');
    } else if (fs.existsSync('../../lib/components.json')) {
        return path.resolve('../../lib/components.json');
    } else if (fs.existsSync('../../../lib/components.json')) {
        return path.resolve('../../../lib/components.json');
    } else if (fs.existsSync('../../../../lib/components.json')) {
        return path.resolve('../../../../lib/components.json');
    } else {
        throw new Error('lib/components.json not found. Are you in a Moodle repo?');
    }
}

/**
 * Get the path to lib/plugins.json
 *
 * @returns {string}
 */
function getPluginsFilePath() {
    if (fs.existsSync('lib/plugins.json')) {
        return path.resolve('lib/plugins.json');
    } else if (fs.existsSync('../lib/plugins.json')) {
        return path.resolve('../lib/plugins.json');
    } else if (fs.existsSync('../../lib/plugins.json')) {
        return path.resolve('../../lib/plugins.json');
    } else if (fs.existsSync('../../../lib/plugins.json')) {
        return path.resolve('../../../lib/plugins.json');
    } else if (fs.existsSync('../../../../lib/plugins.json')) {
        return path.resolve('../../../../lib/plugins.json');
    } else {
        throw new Error('lib/plugins.json not found. Are you in a Moodle repo?');
    }
}

/**
 * Loads the component mapping from disk synchronously.
 * Returns a map of { [componentPath]: componentName }
 */
function loadComponentMap() {
    // These files are always present in a Moodle repo
    const components = JSON.parse(fs.readFileSync(getComponentsFilePath(), 'utf8'));
    const pluginData = JSON.parse(fs.readFileSync(getPluginsFilePath(), 'utf8'));
    const map = {};

    // Subsystems
    if (components.subsystems) {
        for (const [name, relPath] of Object.entries(components.subsystems)) {
            if (relPath) {
                map[relPath] = name.startsWith('core_') ? name : `core_${name}`;
            }
        }
    }
    // Plugintypes
    if (components.plugintypes) {
        for (const [ptype, relPath] of Object.entries(components.plugintypes)) {
            if (pluginData.standard && pluginData.standard[ptype]) {
                for (const pluginName of pluginData.standard[ptype]) {
                    map[path.posix.join(relPath, pluginName)] = `${ptype}_${pluginName}`;
                }
            }
        }
    }
    return map;
}

/**
 * Given a file path, returns the Moodle AMD module name, or throws if not found.
 */
function getModuleNameFromFileName(filePath, componentMap) {
    // Normalize to posix
    const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const amdIdx = rel.indexOf('/amd/src/');
    if (amdIdx === -1) throw new Error('Not an AMD src file');
    const componentPath = rel.slice(0, amdIdx);
    const fileName = rel.slice(amdIdx + '/amd/src/'.length, -3); // remove .js
    const componentName = componentMap[componentPath];
    if (!componentName) throw new Error(`Unable to find module name for ${filePath} (${componentPath})`);
    return `${componentName}/${fileName}`;
}

/**
 * Rollup/Rolldown plugin for Moodle AMD module naming and default export fix.
 * @param {object} options
 *   - componentMap: Optional precomputed component map
 */
export default function addModuleToDefine(options = {}) {
    const componentMap = options.componentMap || loadComponentMap();

    return {
        name: 'add-module-to-define',
        transform(code, id) {
            // Only process JS files in amd/src
            if (!id.includes('/amd/src/') || !id.endsWith('.js')) return null;
            let moduleName;
            try {
                moduleName = getModuleNameFromFileName(id, componentMap);
            } catch (e) {
                // Not a Moodle AMD file, skip
                return null;
            }

            // Regex to match define([deps], ...)
            // or define('name', [deps], ...)
            // We want to ensure the first arg is the module name string
            const defineRegex = /define\s*\(\s*(?:'[^']*'|"[^"]*")?\s*(,\s*)?\[/;
            let replaced = false;
            let newCode = code.replace(/define\s*\(([^)]*)\)/, (match, args) => {
                // Remove any existing name string
                let rest = args.trim();
                if (rest.startsWith("'")) {
                    // Remove the name string and following comma
                    const idx = rest.indexOf(',');
                    if (idx !== -1) rest = rest.slice(idx + 1).trim();
                } else if (rest.startsWith('"')) {
                    const idx = rest.indexOf(',');
                    if (idx !== -1) rest = rest.slice(idx + 1).trim();
                }
                replaced = true;
                // Add a space after define for legacy PHP regex avoidance
                return `define ('${moduleName}', ${rest}`;
            });

            // Patch default export return: look for Object.defineProperty(exports, 'default', ...) or exports.default = ...
            // and add 'return exports.default' at the end of the define callback if not already present
            if (/Object\.defineProperty\s*\(\s*exports\s*,\s*['"]default['"]/.test(newCode) || /exports\.default\s*=/.test(newCode)) {
                // Try to find the end of the define callback and insert return
                newCode = newCode.replace(/(define \([\s\S]*?function\s*\([^)]*\)\s*\{)([\s\S]*?)(\}\s*\)\s*;?)/, (m, start, body, end) => {
                    if (/return\s+exports\.default/.test(body)) return m; // already present
                    return `${start}${body}\n    return exports.default;${end}`;
                });
            }

            if (replaced && newCode !== code) {
                return { code: newCode, map: null };
            }
            return null;
        }
    };
}