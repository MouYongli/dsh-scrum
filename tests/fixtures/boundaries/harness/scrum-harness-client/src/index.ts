// `harness-client-has-no-filesystem`: the browser half reaches the filesystem
// instead of going through the host API.
export { writeFileSync } from 'node:fs'
