/**
 * Component resolver for Moodle module names
 * Maps file paths to Moodle 'Frankenstyle' component names
 * 
 * @copyright  2025 Digitech
 * @license    MIT
 */

const { readJsonFile, normalizePath } = require('./utils');

/**
 * Component resolver class for mapping file paths to Moodle component names
 */
class ComponentResolver {
    constructor(moodleRoot) {
        this.moodleRoot = moodleRoot;
        this.componentCache = null;
        this.subsystems = {};
        this.pluginTypes = {};
    }
    
    /**
     * Loads and caches component mappings from Moodle's components.json
     * 
     * @returns {Object} Component mappings { subsystems, plugintypes }
     */
    getComponentMap() {
        if (this.componentCache) {
            return this.componentCache;
        }
        
        const componentsFile = require('path').join(this.moodleRoot, 'lib', 'components.json');
        const componentsData = readJsonFile(componentsFile);
        
        if (componentsData) {
            // Map subsystems (e.g., "lib/access" -> "core_access")
            for (const [name, dir] of Object.entries(componentsData.subsystems || {})) {
                if (dir) {
                    this.subsystems[dir] = `core_${name}`;
                }
            }
            
            // Special cases for core subsystems
            this.subsystems['public/lib'] = 'core';
            this.subsystems['lib'] = 'core';
            
            // Map plugin types (e.g., "mod/forum" -> "mod_forum")
            for (const [type, dir] of Object.entries(componentsData.plugintypes || {})) {
                this.pluginTypes[dir] = type;
            }
        }
        
        this.componentCache = {
            subsystems: this.subsystems,
            plugintypes: this.pluginTypes
        };
        
        return this.componentCache;
    }
    
    /**
     * Determines the Moodle module name from a file path
     * 
     * @param {string} filePath - Absolute path to the JavaScript file
     * @returns {string} Moodle module name in format "component/filename"
     * @throws {Error} If path is invalid or component cannot be resolved
     */
    getModuleNameFromPath(filePath) {
        const relativePath = normalizePath(
            require('path').relative(this.moodleRoot, filePath)
        );
        
        const parts = relativePath.split('/');
        const amdIndex = parts.indexOf('amd');
        
        if (amdIndex === -1 || parts[amdIndex + 1] !== 'src') {
            throw new Error(`Invalid Moodle AMD path: ${relativePath}. Expected format: */amd/src/*.js`);
        }
        
        const componentPath = parts.slice(0, amdIndex).join('/');
        const fileParts = parts.slice(amdIndex + 2); // Everything after amd/src
        
        // Remove .js extension and join nested paths
        const fileName = fileParts.join('/').replace(/\.js$/, '');
        
        if (!fileName) {
            throw new Error(`Invalid file name in path: ${relativePath}`);
        }
        
        const componentName = this.resolveComponentName(componentPath);
        return `${componentName}/${fileName}`;
    }
    
    /**
     * Resolves component name from a component path
     * 
     * @param {string} componentPath - Path relative to Moodle root (without amd/src)
     * @returns {string} Component name
     * @throws {Error} If component cannot be resolved
     */
    resolveComponentName(componentPath) {
        const map = this.getComponentMap();
        
        // Check subsystems first (exact match)
        if (map.subsystems[componentPath]) {
            return map.subsystems[componentPath];
        }
        
        // Check plugin types (prefix match)
        for (const [pluginRoot, type] of Object.entries(map.plugintypes)) {
            if (componentPath.startsWith(pluginRoot + '/')) {
                const pluginName = componentPath.substring(pluginRoot.length + 1);
                if (!pluginName) {
                    throw new Error(`Invalid plugin path: ${componentPath}. Expected format: ${pluginRoot}/plugin_name`);
                }
                return `${type}_${pluginName}`;
            }
        }
        
        // Fallback: convert path to component name
        const fallbackName = this.pathToComponentName(componentPath);
        
        // Validate that we're not returning an obviously wrong component name
        if (!fallbackName || fallbackName.includes('/')) {
            throw new Error(`Unable to resolve component name for path: ${componentPath}`);
        }
        
        return fallbackName;
    }
    
    /**
     * Converts a path to a component name using fallback logic
     * 
     * @param {string} componentPath - Component path
     * @returns {string} Generated component name
     */
    pathToComponentName(componentPath) {
        if (!componentPath || componentPath === '.') {
            return 'core';
        }
        
        // Handle special cases
        if (componentPath === 'lib') {
            return 'core';
        }
        
        // Convert path separators to underscores
        let componentName = componentPath.replace(/\//g, '_');
        
        // Remove any leading/trailing underscores
        componentName = componentName.replace(/^_+|_+$/g, '');
        
        return componentName || 'core';
    }
    
    /**
     * Validates if a component name follows Moodle conventions
     * 
     * @param {string} componentName - Component name to validate
     * @returns {boolean} True if valid
     */
    isValidComponentName(componentName) {
        // Moodle component names should match: core, core_*, or type_name
        const validPattern = /^(core|[a-z]+_[a-z][a-z0-9_]*)$/;
        return validPattern.test(componentName);
    }
    
    /**
     * Gets all available subsystems
     * 
     * @returns {Object} Map of subsystem paths to names
     */
    getSubsystems() {
        const map = this.getComponentMap();
        return { ...map.subsystems };
    }
    
    /**
     * Gets all available plugin types
     * 
     * @returns {Object} Map of plugin paths to types
     */
    getPluginTypes() {
        const map = this.getComponentMap();
        return { ...map.plugintypes };
    }
    
    /**
     * Clears the component cache (useful for testing)
     */
    clearCache() {
        this.componentCache = null;
        this.subsystems = {};
        this.pluginTypes = {};
    }
}

module.exports = {
    ComponentResolver
};