// `harness-client-has-no-filesystem`: the browser half reaches the filesystem
// instead of going through the host API.
export { writeFileSync } from 'node:fs'
// Also `harness-client-has-no-filesystem`: `createRequire` reads files off
// disk just as well as `fs` does, and once slipped through unmatched.
export { createRequire } from 'node:module'
