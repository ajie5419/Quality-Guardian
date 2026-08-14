import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import IssueEditModal from './IssueEditModal.vue';

const { mockClearMatchedCases, mockResetForm, mockSetValues } = vi.hoisted(
  () => ({
    mockClearMatchedCases: vi.fn(),
    mockResetForm: vi.fn(),
    mockSetValues: vi.fn(),
  }),
);

vi.mock('@vben/locales', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@vben/stores', () => ({
  useUserStore: () => ({
    userInfo: { realName: 'Inspector' },
  }),
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
  Modal: defineComponent({
    name: 'MockModal',
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  }),
}));

vi.mock('#/api/qms/inspection', () => ({
  createInspectionIssue: vi.fn(),
  updateInspectionIssue: vi.fn(),
}));

vi.mock('#/hooks/useAdaptivePopup', () => ({
  useAdaptivePopup: () => ({
    isMobile: false,
    modalWidth: 320,
    modalWrapClassName: '',
  }),
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

vi.mock('#/views/qms/shared/utils/photo-url', () => ({
  buildThumbUrlFromOriginal: (url: string) => url,
}));

vi.mock('#/views/qms/shared/utils/upload-file', () => ({
  getUploadResponse: vi.fn(),
}));

vi.mock('./IssueFormFields.vue', () => ({
  default: defineComponent({
    name: 'MockIssueFormFields',
    setup(_, { expose }) {
      expose({
        clearMatchedCases: mockClearMatchedCases,
        getValues: vi.fn(),
        resetForm: mockResetForm,
        setValues: mockSetValues,
        validate: vi.fn(),
      });
      return () => h('div');
    },
  }),
}));

describe('inspection issue edit modal', () => {
  it('prefills the explicit canonical department ID instead of a legacy snapshot', async () => {
    const wrapper = mount(IssueEditModal, {
      props: {
        deptTreeData: [],
        initialData: {
          id: 'issue-1',
          responsibleDepartment: '质量部',
          responsibleDepartmentId: 'dept-1770026473133',
          responsibleDepartments: ['dept-legacy'],
        },
        isEditMode: true,
        open: false,
      },
    });

    await wrapper.setProps({ open: true });
    await nextTick();

    expect(mockSetValues).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibleDepartmentId: 'dept-1770026473133',
      }),
    );

    wrapper.unmount();
  });
});
