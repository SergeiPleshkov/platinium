<script setup lang="ts">
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'

import { categorySchema } from '@/features/categories/schema'
import { useCategoriesStore } from '@/features/categories/store'
import type { Category } from '@/features/categories/types'
import { ApiError } from '@/shared/api'
import { zodSchema } from '@/shared/validation/zodSchema'
import { useNotifications } from '@/shared/composables'
import { BaseButton, BaseInput, BaseModal, BaseTextarea } from '@/shared/ui'

/**
 * Create and edit in one dialog, driven by an optional `category` prop.
 *
 * Two forms would be two places for a validation rule to drift. The only difference between
 * the modes is the initial values, the heading and which store action runs.
 */

interface Props {
  /** Absent means create. */
  category?: Category | null | undefined
}

const props = withDefaults(defineProps<Props>(), { category: null })

const emit = defineEmits<{ saved: [category: Category] }>()

const open = defineModel<boolean>('open', { required: true })

const store = useCategoriesStore()
const notifications = useNotifications()

const submitting = ref(false)
/** A failure that belongs to no single field, a conflict, a 500, a dropped connection. */
const formError = ref<string | null>(null)

const isEdit = computed(() => props.category !== null)

/*
 * `@vee-validate/zod` is not used: it peer-depends on zod 3 and reads Zod 3 internals, so
 * any schema with `.default()` throws at setup. It took this dialog down on first render.
 * `zodSchema` is our own adapter. See src/shared/validation/zodSchema.ts.
 */
const { defineField, handleSubmit, errors, setErrors, resetForm } = useForm({
  validationSchema: zodSchema(categorySchema),
  initialValues: { name: '', description: '' },
})

const [name] = defineField('name')
const [description] = defineField('description')

/*
 * Re-seed whenever the dialog opens. Without this, opening "edit" after a previous edit shows
 * the last record's values for a frame, and a cancelled create leaves its text behind.
 */
watch(
  () => [open.value, props.category] as const,
  ([isOpen, category]) => {
    if (!isOpen) return
    formError.value = null
    resetForm({
      values: {
        name: category?.name ?? '',
        description: category?.description ?? '',
      },
    })
  },
  { immediate: true },
)

const onSubmit = handleSubmit(async (values) => {
  submitting.value = true
  formError.value = null

  try {
    const saved = props.category
      ? await store.update(props.category.id, values)
      : await store.create(values)

    notifications.success(
      isEdit.value ? 'Category updated' : 'Category created',
      `“${saved.name}” has been saved.`,
    )
    open.value = false
    emit('saved', saved)
  } catch (caught) {
    /*
     * A 422 is projected back onto the fields that caused it, because the server knows things the
     * client cannot, such as a name already being taken. Anything else is a form-level
     * message, because no single field is at fault.
     */
    if (caught instanceof ApiError && caught.isValidation) {
      setErrors(caught.fieldErrors)
    } else {
      formError.value =
        caught instanceof ApiError ? caught.message : 'Could not save the category. Try again.'
    }
  } finally {
    submitting.value = false
  }
})
</script>

<template>
  <BaseModal
    v-model:open="open"
    :title="isEdit ? 'Edit category' : 'New category'"
    :description="isEdit ? 'Update this ticket tier.' : 'Ticket tiers group tickets across events.'"
    :busy="submitting"
  >
    <form id="category-form" class="flex flex-col gap-4" novalidate @submit="onSubmit">
      <p
        v-if="formError"
        role="alert"
        class="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        {{ formError }}
      </p>

      <BaseInput
        v-model="name"
        label="Name"
        placeholder="e.g. Early Bird"
        required
        :error="errors.name"
        :disabled="submitting"
      />

      <BaseTextarea
        v-model="description"
        label="Description"
        placeholder="What this tier includes"
        hint="Optional. Shown to administrators only."
        :error="errors.description"
        :disabled="submitting"
      />
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" :disabled="submitting" @click="open = false">
          Cancel
        </BaseButton>
        <!-- Outside the <form>, so it is associated by id rather than by nesting. -->
        <BaseButton type="submit" form="category-form" :loading="submitting">
          {{ isEdit ? 'Save changes' : 'Create category' }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
