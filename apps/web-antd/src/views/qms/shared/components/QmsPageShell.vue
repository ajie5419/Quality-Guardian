<script lang="ts" setup>
type PageDensity = 'compact' | 'standard';
type PageLayout = 'contained' | 'fluid';

interface Props {
  contentClass?: string;
  density?: PageDensity;
  footerClass?: string;
  layout?: PageLayout;
  pageClass?: string;
  showFooter?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  contentClass: '',
  density: 'standard',
  footerClass: '',
  layout: 'fluid',
  pageClass: '',
  showFooter: false,
});
</script>

<template>
  <section
    class="qms-page-shell"
    :class="[
      `qms-page-shell--${props.layout}`,
      `qms-page-shell--${props.density}`,
      props.pageClass,
    ]"
  >
    <div class="qms-page-shell__content" :class="props.contentClass">
      <slot></slot>
    </div>
    <div
      v-if="props.showFooter"
      class="qms-page-shell__footer"
      :class="props.footerClass"
    >
      <slot name="footer"></slot>
    </div>
  </section>
</template>
