/**
 * Browser build. The node half is emitted by `tsc -b`; this produces the single
 * bundle the web shell serves under `/plugins/<package>/client.js`.
 *
 * The wrapper is the shell's contract, not a preference: executing the script
 * must only register a factory, so the body is wrapped in
 * `window.__ModuleLoader__.load({ id, factory })` and written as CJS, whose
 * `require` the loader supplies from its own module table.
 */
import { defineConfig } from 'tsdown'

const ID = '@dsh-scrum/scrum-harness-client'

/**
 * The shell's frozen module table. Anything not listed here has to be bundled,
 * because the injected `require` can only answer these specifiers; a miss
 * throws at materialization rather than at build time.
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

export default defineConfig({
  name: ID,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: [...PLATFORM_MODULES],
    alwaysBundle: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
