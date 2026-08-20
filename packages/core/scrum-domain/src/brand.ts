declare const brand: unique symbol

/**
 * Nominal typing helper. A branded value is structurally a plain string or
 * number at runtime, but a plain value cannot be assigned to it without going
 * through the matching constructor, which validates the format.
 */
export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name }
