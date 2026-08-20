// `domain-stays-pure`: the domain reaches a Node built-in.
// `no-undeclared-dependency-in-source`: `vitest` is a development dependency
// of the workspace root, and this fixture package declares no dependencies.
import { readFileSync } from 'node:fs'
import { expect } from 'vitest'

export { readFileSync, expect }
