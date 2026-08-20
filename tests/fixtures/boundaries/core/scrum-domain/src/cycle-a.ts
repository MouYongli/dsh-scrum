// `no-circular`: paired with `cycle-b.ts`.
import { b } from './cycle-b.js'

export const a = () => b()
