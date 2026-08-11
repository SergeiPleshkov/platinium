import type { ArgTypesEnhancer, InputType, SBType } from 'storybook/internal/csf'

/**
 * Vue props typed for `exactOptionalPropertyTypes` as `boolean | undefined` /
 * `string | undefined` (and string-literal unions ending in `| undefined`) are
 * emitted by vue-component-meta as SB unions. Storybook's `inferControls` then
 * maps every union to an object control — which is why the panel shows
 * "Set object" for ordinary toggles and text fields.
 *
 * This second-pass enhancer unwraps those optional primitives into the controls
 * humans expect, without touching real objects or story-authored argTypes that
 * already picked a non-object control.
 */

function isUndefinedMember(type: SBType): boolean {
  return type.name === 'other' && type.value === 'undefined'
}

function controlType(argType: InputType): string | undefined {
  const control = argType.control
  if (control === false || control == null) return undefined
  if (typeof control === 'string') return control
  return control.type
}

function literalOption(type: SBType): string | null {
  if (type.name !== 'other' || typeof type.value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(type.value)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function controlForOptionalUnion(type: SBType): InputType | null {
  if (type.name !== 'union') return null

  const members = type.value.filter((member) => !isUndefinedMember(member))
  if (members.length === 0) return null

  if (members.length === 1) {
    const only = members[0]
    if (only?.name === 'boolean') return { control: { type: 'boolean' } }
    if (only?.name === 'string') return { control: { type: 'text' } }
    if (only?.name === 'number') return { control: { type: 'number' } }
    return null
  }

  const options = members.map(literalOption)
  if (options.every((option): option is string => option !== null)) {
    return {
      control: { type: options.length <= 5 ? 'radio' : 'select' },
      options,
    }
  }

  return null
}

const fixOptionalPrimitiveControls: ArgTypesEnhancer = (context) => {
  const next = { ...context.argTypes }

  for (const [name, argType] of Object.entries(next)) {
    if (!argType?.type) continue

    /*
     * Run before `inferControls` (which maps every union → object) and after it.
     * Skip only when a story already chose a real control (select, radio, …).
     */
    const existing = controlType(argType)
    if (existing !== undefined && existing !== 'object') continue

    const fix = controlForOptionalUnion(argType.type)
    if (fix?.control == null) continue

    const patched: typeof argType = { ...argType, control: fix.control }
    if (fix.options !== undefined) patched.options = fix.options
    next[name] = patched
  }

  return next
}

fixOptionalPrimitiveControls.secondPass = true

export { fixOptionalPrimitiveControls }
