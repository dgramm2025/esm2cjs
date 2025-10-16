#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

import { glob } from 'glob';
import { rollup as rolldown } from 'rollup';

import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

import addModuleToDefine from './lib/rollup-plugin-add-module-to-define.js';


async function main() {
    const files = glob.sync('amd/src/**/*.js');
    
    for (const inputFile of files) {
        const file = inputFile.replace(/\\/g, '/');
        const output = file.replace('amd/src', 'amd/build').replace('.js', '.min.js');

        if (!fs.existsSync(path.dirname(output))) {
            fs.mkdirSync(path.dirname(output), { recursive: true });
        }

        const bundler = await rolldown(
            {
            input: file,
            plugins: [

                nodeResolve(),

                commonjs(),

                babel({
                    babelHelpers: 'bundled',
                    presets: [
                        [
                            '@babel/preset-env',
                            {
                                useBuiltIns: 'usage',
                                corejs: '3',
                                targets: {
                                    esmodules: true,
                                }
                            }
                        ]
                    ],
                    plugins: [
                        './lib/babel-plugin-transform-amd-to-commonjs.js'
                    ],
                    exclude: 'node_modules/**'
                }),

                addModuleToDefine({
                    define: {
                        'process.env.NODE_ENV': JSON.stringify('production')
                    }
                }),

                terser()
            ]
        });

        await bundler.write({
            file: output,
            format: 'cjs',
            sourcemap: false,
        });
        console.log(`Built ${output}`);
    }
}

main().catch(err => { throw new Error(err); });
