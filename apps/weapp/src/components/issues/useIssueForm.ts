import type { DepartmentNode } from '@/api/inspection';
import type {
  InspectionIssuePayload,
  InspectionIssueRecord,
  IssueOption,
} from '@/api/issues';

import { computed, reactive, ref, watch } from 'vue';

import {
  getDepartments,
  getProcessDictionaryOptions,
  getProcesses,
  searchWorkOrders,
} from '@/api/inspection';
import {
  createInspectionIssue,
  getIssueSuppliers,
  getIssueWelders,
  updateInspectionIssue,
} from '@/api/issues';
import { useUserStore } from '@/stores/user';
import {
  ISSUE_CLAIM_OPTIONS,
  ISSUE_DEFAULTS,
  ISSUE_DEFECT_SUBTYPES,
  ISSUE_DEFECT_TYPES,
  ISSUE_SEVERITY_OPTIONS,
  ISSUE_STATUS_OPTIONS,
  mergeInspectionProcessOptions,
} from '@/utils/issues';
import {
  INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS,
  mergeInspectionProcessNames,
} from '@qgs/shared';

export interface IssueFormProps {
  initialData?: InspectionIssueRecord;
  mode: 'create' | 'edit';
}

interface WorkOrderItem {
  division?: string;
  projectName: string;
  quantity: number;
  workOrderNumber: string;
}

interface FlatDepartment {
  id: string;
  name: string;
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function flattenDepartments(nodes: DepartmentNode[]): FlatDepartment[] {
  const result: FlatDepartment[] = [];
  const visit = (items: DepartmentNode[]) => {
    for (const item of items) {
      result.push({ id: String(item.id), name: item.name });
      if (item.children?.length) visit(item.children);
    }
  };
  visit(nodes);
  return result;
}

export function useIssueForm(
  props: IssueFormProps,
  callbacks: { success: (issue: InspectionIssueRecord | null) => void },
) {
  const userStore = useUserStore();
  const currentStep = ref(1);
  const submitting = ref(false);
  const searching = ref(false);
  const showWorkOrderResults = ref(false);
  const showDepartments = ref(false);
  const ready = ref(false);
  const workOrderResults = ref<WorkOrderItem[]>([]);
  const processReferenceOptions = ref<IssueOption[]>([]);
  const processOptions = ref<IssueOption[]>([]);
  const departments = ref<FlatDepartment[]>([]);
  const supplierOptions = ref<IssueOption[]>([]);
  const welderOptions = ref<IssueOption[]>([]);
  let searchTimer: null | ReturnType<typeof setTimeout> = null;

  function createInitialState() {
    return {
      claim: ISSUE_DEFAULTS.DEFAULT_CLAIM,
      defectSubtype: ISSUE_DEFAULTS.DEFAULT_DEFECT_SUBTYPE,
      defectType: ISSUE_DEFAULTS.DEFAULT_DEFECT_TYPE,
      description: '',
      division: '',
      inspector:
        userStore.userInfo?.realName || userStore.userInfo?.username || '',
      lossAmount: 0,
      ncNumber: '',
      partName: '',
      photos: [],
      processName: '',
      projectName: '',
      quantity: ISSUE_DEFAULTS.DEFAULT_QUANTITY,
      reportDate: today(),
      responsibleDepartments: [],
      responsibleWelder: '',
      rootCause: '',
      severity: ISSUE_DEFAULTS.DEFAULT_SEVERITY,
      solution: '',
      status: ISSUE_DEFAULTS.DEFAULT_STATUS,
      supplierName: '',
      workOrderNumber: '',
    };
  }

  const form = reactive(createInitialState());
  const draftKey = computed(() =>
    props.mode === 'edit' && props.initialData?.id
      ? `inspectionIssueDraft:${userStore.userInfo?.id || 'anonymous'}:edit:${props.initialData.id}`
      : `inspectionIssueDraft:${userStore.userInfo?.id || 'anonymous'}:create`,
  );
  const defectSubtypeOptions = computed(
    () => ISSUE_DEFECT_SUBTYPES[form.defectType] ?? ['其他'],
  );
  const selectedDepartmentNames = computed(() =>
    form.responsibleDepartments
      .map((id) => departments.value.find((item) => item.id === id)?.name || id)
      .join('、'),
  );
  const requiresSupplier = computed(() => {
    const names = selectedDepartmentNames.value;
    return (
      names.includes(INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS.PURCHASE) ||
      names.includes(INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS.PRODUCTION) ||
      names.includes(INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS.OUTSOURCED) ||
      names.includes('生产')
    );
  });
  const selectedProcessLabel = computed(
    () =>
      processOptions.value.find((item) => item.value === form.processName)
        ?.label || form.processName,
  );
  const requiresWelder = computed(
    () => selectedProcessLabel.value.trim() === '焊接',
  );
  const supplierCategory = computed<'Outsourcing' | 'Supplier'>(() => {
    const names = selectedDepartmentNames.value;
    return names.includes(INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS.PRODUCTION) ||
      names.includes(INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS.OUTSOURCED) ||
      names.includes('生产')
      ? 'Outsourcing'
      : 'Supplier';
  });
  const supplierPickerOptions = computed(() =>
    includeLegacyOption(supplierOptions.value, form.supplierName),
  );
  const welderPickerOptions = computed(() =>
    includeLegacyOption(welderOptions.value, form.responsibleWelder),
  );

  function includeLegacyOption(options: IssueOption[], value: string) {
    if (!value || options.some((item) => item.value === value)) return options;
    return [{ label: value, value }, ...options];
  }

  function resetProcessOptions(preferredOptions: ReadonlyArray<unknown> = []) {
    const preferred = mergeInspectionProcessNames(preferredOptions).map(
      (value) => ({ label: value, value }),
    );
    processOptions.value = mergeInspectionProcessOptions(
      preferred,
      processReferenceOptions.value,
    );
  }

  function applyData(data?: InspectionIssueRecord) {
    Object.assign(form, createInitialState());
    if (!data) return;
    let responsibleDepartments: string[] = [];
    if (data.responsibleDepartments?.length) {
      responsibleDepartments = [...data.responsibleDepartments];
    } else if (data.responsibleDepartment) {
      responsibleDepartments = [data.responsibleDepartment];
    }
    Object.assign(form, {
      ...data,
      claim: data.claim || ISSUE_DEFAULTS.DEFAULT_CLAIM,
      defectSubtype:
        data.defectSubtype || ISSUE_DEFAULTS.DEFAULT_DEFECT_SUBTYPE,
      defectType: data.defectType || ISSUE_DEFAULTS.DEFAULT_DEFECT_TYPE,
      lossAmount: Number(data.lossAmount || 0),
      photos: Array.isArray(data.photos) ? [...data.photos] : [],
      processName: data.processName || '',
      quantity: Number(data.quantity || 1),
      reportDate: data.reportDate || today(),
      responsibleDepartments,
      severity: data.severity || ISSUE_DEFAULTS.DEFAULT_SEVERITY,
      status: String(
        data.status || ISSUE_DEFAULTS.DEFAULT_STATUS,
      ).toUpperCase(),
    });
    resetProcessOptions(form.processName ? [form.processName] : []);
  }

  function restoreDraft() {
    const draft = uni.getStorageSync(draftKey.value);
    if (!draft || typeof draft !== 'object') return false;
    Object.assign(form, draft as ReturnType<typeof createInitialState>);
    uni.showToast({ title: '已恢复本地草稿', icon: 'none' });
    return true;
  }

  function clearDraft() {
    uni.removeStorageSync(draftKey.value);
    applyData(props.initialData);
    currentStep.value = 1;
    uni.showToast({ title: '草稿已清除', icon: 'none' });
  }

  async function loadReferenceData() {
    const [departmentResult, processResult, welderResult] =
      await Promise.allSettled([
        getDepartments(),
        getProcessDictionaryOptions(),
        getIssueWelders(),
      ]);
    const departmentRes =
      departmentResult.status === 'fulfilled' ? departmentResult.value : null;
    const welderRes =
      welderResult.status === 'fulfilled' ? welderResult.value : null;
    const processRes =
      processResult.status === 'fulfilled' ? processResult.value : null;
    if (departmentRes?.code === 0 && Array.isArray(departmentRes.data)) {
      departments.value = flattenDepartments(departmentRes.data);
    }
    if (welderRes?.code === 0 && Array.isArray(welderRes.data.items)) {
      welderOptions.value = welderRes.data.items.map((item) => ({
        label: item.welderCode
          ? `${item.name}（${item.welderCode}）`
          : item.name,
        value: item.welderCode || item.name,
      }));
    }
    if (processRes?.code === 0 && processRes.data.length > 0) {
      processReferenceOptions.value = mergeInspectionProcessOptions(
        processRes.data.map((item) => ({
          label: item.dictValue || item.dictKey,
          value: item.dictKey,
        })),
        fallbackProcessOptions,
      );
    }
    resetProcessOptions(form.processName ? [form.processName] : []);
    await loadSuppliers();
  }

  async function loadSuppliers() {
    try {
      const res = await getIssueSuppliers(supplierCategory.value);
      if (res.code === 0 && Array.isArray(res.data.items)) {
        supplierOptions.value = res.data.items.map((item) => ({
          label: item.name,
          value: item.name,
        }));
      }
    } catch {
      supplierOptions.value = [];
    }
  }

  async function initialize() {
    applyData(props.initialData);
    restoreDraft();
    try {
      await loadReferenceData();
    } finally {
      ready.value = true;
    }
  }

  function onWorkOrderInput(event: { detail: { value: string } }) {
    form.workOrderNumber = event.detail.value;
    form.projectName = '';
    form.division = '';
    form.processName = '';
    resetProcessOptions();
    if (searchTimer) clearTimeout(searchTimer);
    const keyword = form.workOrderNumber.trim();
    if (!keyword) {
      workOrderResults.value = [];
      showWorkOrderResults.value = false;
      return;
    }
    searchTimer = setTimeout(() => void searchWorkOrder(keyword), 400);
  }

  async function searchWorkOrder(keyword: string) {
    searching.value = true;
    try {
      const res = await searchWorkOrders(keyword);
      if (res.code === 0) {
        workOrderResults.value = res.data.items;
        showWorkOrderResults.value = res.data.items.length > 0;
      }
    } catch {
      workOrderResults.value = [];
      showWorkOrderResults.value = false;
      uni.showToast({ title: '工单搜索失败', icon: 'none' });
    } finally {
      searching.value = false;
    }
  }

  async function selectWorkOrder(item: WorkOrderItem) {
    Object.assign(form, {
      workOrderNumber: item.workOrderNumber,
      projectName: item.projectName || '',
      division: item.division || '',
      quantity: Number(item.quantity || 1),
    });
    showWorkOrderResults.value = false;
    try {
      const res = await getProcesses(item.workOrderNumber);
      const workOrderProcesses =
        res.code === 0 && Array.isArray(res.data)
          ? res.data.map((entry) => entry.processName)
          : [];
      resetProcessOptions(workOrderProcesses);
      form.processName = '';
    } catch {
      resetProcessOptions();
      uni.showToast({ title: '工序加载失败', icon: 'none' });
    }
  }

  function onProcessChange(event: { detail: { value: string } }) {
    form.processName =
      processOptions.value[Number(event.detail.value)]?.value || '';
  }

  function onDateChange(event: { detail: { value: string } }) {
    form.reportDate = event.detail.value;
  }

  function onStatusChange(event: { detail: { value: string } }) {
    form.status = ISSUE_STATUS_OPTIONS[Number(event.detail.value)]?.value || '';
  }

  function onSeverityChange(event: { detail: { value: string } }) {
    form.severity =
      ISSUE_SEVERITY_OPTIONS[Number(event.detail.value)]?.value || '';
  }

  function onClaimChange(event: { detail: { value: string } }) {
    form.claim = ISSUE_CLAIM_OPTIONS[Number(event.detail.value)]?.value || '';
  }

  function onDefectTypeChange(event: { detail: { value: string } }) {
    form.defectType = ISSUE_DEFECT_TYPES[Number(event.detail.value)] || '';
    form.defectSubtype = ISSUE_DEFECT_SUBTYPES[form.defectType]?.[0] || '其他';
  }

  function onDefectSubtypeChange(event: { detail: { value: string } }) {
    form.defectSubtype =
      defectSubtypeOptions.value[Number(event.detail.value)] || '';
  }

  async function onDepartmentChange(event: { detail: { value: string[] } }) {
    const previousCategory = supplierCategory.value;
    const selected = event.detail.value.map(String);
    form.responsibleDepartments = selected.slice(0, 20);
    if (selected.length > 20) {
      uni.showToast({ title: '责任部门最多选择20个', icon: 'none' });
    }
    if (
      props.mode === 'create' &&
      previousCategory !== supplierCategory.value
    ) {
      form.supplierName = '';
    }
    await loadSuppliers();
  }

  function onSupplierChange(event: { detail: { value: string } }) {
    form.supplierName =
      supplierPickerOptions.value[Number(event.detail.value)]?.value || '';
  }

  function onWelderChange(event: { detail: { value: string } }) {
    form.responsibleWelder =
      welderPickerOptions.value[Number(event.detail.value)]?.value || '';
  }

  function validateBasic() {
    if (!form.reportDate || !form.workOrderNumber.trim())
      return '请选择工单和日期';
    if (!form.partName.trim() || !form.processName.trim())
      return '请填写部件并选择工序';
    if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1)
      return '数量必须大于0';
    return '';
  }

  function validateClassification() {
    if (form.responsibleDepartments.length === 0) return '请选择责任部门';
    if (requiresSupplier.value && !form.supplierName.trim())
      return '请填写责任单位';
    if (requiresWelder.value && !form.responsibleWelder.trim())
      return '请填写责任焊工';
    if (
      !form.status ||
      !form.severity ||
      !form.defectType ||
      !form.defectSubtype
    )
      return '请填写状态、严重程度和缺陷分类';
    return '';
  }

  function validateAnalysis() {
    if (!form.description.trim()) return '请填写不合格描述';
    if (!form.rootCause.trim()) return '请填写原因分析';
    if (!form.solution.trim()) return '请填写解决方案';
    return '';
  }

  function validateStep(step: number) {
    if (step === 1) return validateBasic();
    if (step === 2) return validateClassification();
    return validateAnalysis();
  }

  function nextStep() {
    const message = validateStep(currentStep.value);
    if (message) {
      uni.showToast({ title: message, icon: 'none' });
      return;
    }
    currentStep.value = Math.min(3, currentStep.value + 1);
  }

  function previousStep() {
    currentStep.value = Math.max(1, currentStep.value - 1);
  }

  function buildPayload(): InspectionIssuePayload {
    const responsibleDepartments = [...form.responsibleDepartments];
    return {
      ...form,
      lossAmount: Number(form.lossAmount || 0),
      photos: [...form.photos],
      quantity: Number(form.quantity),
      responsibleDepartment: responsibleDepartments[0] || '',
      responsibleDepartments,
    } as InspectionIssuePayload;
  }

  function validateAll() {
    for (const step of [1, 2, 3]) {
      const message = validateStep(step);
      if (message) return { message, step };
    }
    return null;
  }

  async function submit() {
    const invalid = validateAll();
    if (invalid) {
      currentStep.value = invalid.step;
      uni.showToast({ title: invalid.message, icon: 'none' });
      return;
    }
    if (submitting.value) return;
    submitting.value = true;
    uni.showLoading({ title: '保存中...' });
    try {
      const response =
        props.mode === 'edit' && props.initialData?.id
          ? await updateInspectionIssue(props.initialData.id, buildPayload())
          : await createInspectionIssue(buildPayload());
      if (response.code !== 0) throw new Error(response.message || '保存失败');
      uni.removeStorageSync(draftKey.value);
      uni.hideLoading();
      uni.showToast({ title: '保存成功', icon: 'success' });
      callbacks.success(
        props.mode === 'create'
          ? (response.data as InspectionIssueRecord)
          : null,
      );
    } catch (error) {
      uni.hideLoading();
      uni.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      });
    } finally {
      submitting.value = false;
    }
  }

  watch(
    form,
    (value) => {
      if (ready.value) uni.setStorageSync(draftKey.value, { ...value });
    },
    { deep: true },
  );

  return {
    currentStep,
    departments,
    defectSubtypeOptions,
    form,
    ISSUE_CLAIM_OPTIONS,
    ISSUE_DEFECT_TYPES,
    ISSUE_SEVERITY_OPTIONS,
    ISSUE_STATUS_OPTIONS,
    onClaimChange,
    onDateChange,
    onDefectSubtypeChange,
    onDefectTypeChange,
    onDepartmentChange,
    onProcessChange,
    onSeverityChange,
    onStatusChange,
    onSupplierChange,
    onWelderChange,
    onWorkOrderInput,
    processOptions,
    requiresSupplier,
    requiresWelder,
    searching,
    selectedProcessLabel,
    selectedDepartmentNames,
    showDepartments,
    showWorkOrderResults,
    submitting,
    supplierPickerOptions,
    welderPickerOptions,
    workOrderResults,
    clearDraft,
    initialize,
    nextStep,
    previousStep,
    selectWorkOrder,
    submit,
  };
}
