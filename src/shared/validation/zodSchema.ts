import type { TypedSchema, TypedSchemaError } from 'vee-validate'
import type { z } from 'zod'

/**
 * Adapts a Zod 4 schema to vee-validate's `TypedSchema`.
 *
 * Written in-house rather than using `@vee-validate/zod`, which peer-depends on `zod@^3` and
 * still reads Zod 3 internals — `_def.defaultValue()`, which in Zod 4 is a value rather than
 * a function. Any schema using `.default()` throws at form setup. That is not a version we
 * can paper over: the adapter is reaching into another library's private shape.
 *
 * The contract is small enough that owning it is cheaper than downgrading every schema in the
 * application to Zod 3, and it removes a dependency that cannot follow us forward.
 */
export function zodSchema<TSchema extends z.ZodType>(
  schema: TSchema,
): TypedSchema<z.input<TSchema>, z.output<TSchema>> {
  return {
    __type: 'VVTypedSchema',

    async parse(values) {
      const result = await schema.safeParseAsync(values)

      if (result.success) {
        return { value: result.data, errors: [] }
      }

      /*
       * vee-validate expects one entry per path with all of that path's messages. Zod emits
       * one issue per failed rule, so several can share a path — grouping them keeps the
       * order Zod produced, which is the order the rules were declared in.
       */
      const byPath = new Map<string, string[]>()
      for (const issue of result.error.issues) {
        const path = issue.path.map(String).join('.')
        const existing = byPath.get(path)
        if (existing) existing.push(issue.message)
        else byPath.set(path, [issue.message])
      }

      const errors: TypedSchemaError[] = [...byPath].map(([path, messages]) => ({
        path,
        errors: messages,
      }))

      return { errors }
    },

    /**
     * Seeds initial values by letting the schema apply its own defaults.
     *
     * Partial input will not satisfy the schema, so a failed parse falls back to whatever the
     * caller supplied — `useForm`'s own `initialValues` then win, which is the sane outcome.
     */
    cast(values) {
      const result = schema.safeParse(values)
      return result.success ? (result.data as z.input<TSchema>) : (values as z.input<TSchema>)
    },
  }
}
