<script lang="ts" setup>
interface Props {
  contentClass?: string;
  footerClass?: string;
  pageClass?: string;
  showFooter?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  contentClass: '',
  footerClass: '',
  pageClass: '',
  showFooter: false,
});
</script>

<template>
  <section class="qms-mobile-shell" :class="props.pageClass">
    <div class="qms-mobile-shell__content" :class="props.contentClass">
      <slot></slot>
    </div>
    <div
      v-if="props.showFooter"
      class="qms-mobile-shell__footer"
      :class="props.footerClass"
    >
      <slot name="footer"></slot>
    </div>
  </section>
</template>
