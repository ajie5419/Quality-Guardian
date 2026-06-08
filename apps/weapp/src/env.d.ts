// / <reference types="@dcloudio/types" />
// / <reference types="@uni-helper/uni-app-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<object, object, unknown>;
  export default component;
}
