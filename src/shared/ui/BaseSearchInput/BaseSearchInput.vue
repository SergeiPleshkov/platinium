<script setup lang="ts">
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import { useId } from 'vue'

/**
 * The search box above a list.
 *
 * Kept separate from `BaseInput` because it is a toolbar control, not a form field: it has no
 * visible label, carries `type="search"`, and gets a clear button. The label still exists for
 * screen readers — an unlabelled search box is a common and avoidable failure.
 */

interface Props {
  label?: string | undefined
  placeholder?: string | undefined
  disabled?: boolean | undefined
}

withDefaults(defineProps<Props>(), {
  label: 'Search',
  placeholder: 'Search…',
  disabled: false,
})

const model = defineModel<string>({ default: '' })

const inputId = `search-${useId()}`
</script>

<template>
  <!--
    No width of its own: a shared primitive that sizes itself fights whatever grid places it.
    Capping at `max-w-xs` here left the search 320px beside 720px filter selects on a tablet.
    The page owns the track; this fills it.
  -->
  <div class="w-full">
    <label :for="inputId" class="sr-only">{{ label }}</label>
    <IconField>
      <InputIcon class="pi pi-search" />
      <InputText
        :id="inputId"
        v-model="model"
        type="search"
        :placeholder="placeholder"
        :disabled="disabled"
        fluid
      />
    </IconField>
  </div>
</template>
