<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, h, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationRegister, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getPublicDepartmentsApi } from '#/api/core/auth';
import { requestClient } from '#/api/request';

defineOptions({ name: 'Register' });

const router = useRouter();
const loading = ref(false);

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'ApiTreeSelect',
      componentProps: {
        allowClear: true,
        api: getPublicDepartmentsApi,
        fieldNames: {
          children: 'children',
          label: 'name',
          value: 'id',
        },
        placeholder: '请选择所属部门',
        style: {
          width: '100%',
        },
      },
      defaultValue: undefined,
      fieldName: 'deptId',
      label: '所属部门',
      rules: z
        .string({ required_error: '请选择所属部门' })
        .min(1, { message: '请选择所属部门' }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      renderComponentContent() {
        return {
          strengthText: () => $t('authentication.passwordStrength'),
        };
      },
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.confirmPassword'),
      },
      dependencies: {
        rules(values) {
          const { password } = values;
          return z
            .string({ required_error: $t('authentication.passwordTip') })
            .min(1, { message: $t('authentication.passwordTip') })
            .refine((value) => value === password, {
              message: $t('authentication.confirmPasswordTip'),
            });
        },
        triggerFields: ['password'],
      },
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
    },
    {
      component: 'VbenCheckbox',
      fieldName: 'agreePolicy',
      renderComponentContent: () => ({
        default: () =>
          h('span', [
            $t('authentication.agree'),
            h(
              'a',
              {
                class: 'vben-link ml-1 ',
                href: '',
              },
              `${$t('authentication.privacyPolicy')} & ${$t('authentication.terms')}`,
            ),
          ]),
      }),
      rules: z.boolean().refine((value) => !!value, {
        message: $t('authentication.agreeTip'),
      }),
    },
  ];
});

async function handleSubmit(value: Recordable<unknown>) {
  loading.value = true;
  try {
    const val = value as Record<string, any>;
    await requestClient.post('/auth/register', {
      deptId: val.deptId,
      password: val.password,
      username: val.username,
    });
    message.success('注册成功！请登录');
    router.push('/auth/login');
  } catch (error: unknown) {
    const axiosError = error as { message?: string };
    message.error(axiosError?.message || '注册失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="registration-page">
    <AuthenticationRegister
      :form-schema="formSchema"
      :loading="loading"
      @submit="handleSubmit"
    />
  </div>
</template>

<style scoped>
:deep(.ant-select-selection-placeholder) {
  color: hsl(var(--muted-foreground)) !important;
  opacity: 0.8;
}
</style>
