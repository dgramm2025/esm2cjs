#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

import { glob } from 'glob';
import { rolldown } from 'rolldown';
import addModuleToDefine from './lib/rollup-plugin-add-module-to-define.js';


async function main() {
    const files = glob.sync('amd/src/**/*.js');
    
    for (const file of files) {
        const output = file.replace('amd/src', 'amd/build');

        if (!fs.existsSync(path.dirname(output))) {
            fs.mkdirSync(path.dirname(output), { recursive: true });
        }

        await rolldown(file, output, {
            plugins: [
                addModuleToDefine({
                    define: {
                        'process.env.NODE_ENV': JSON.stringify('production')
                    }
                })
            ]
        });
    }
}

main().catch(err => { throw new Error(err); });
