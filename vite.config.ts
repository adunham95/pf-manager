import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// base './' keeps every URL relative, so the build (and its service worker) works from any folder.
export default defineConfig({ base: './', plugins: [svelte(), viteSingleFile()] })
