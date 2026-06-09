<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import {
  getBomParts,
  getProcesses,
  getTeams,
  searchWorkOrders,
  submitInspectionRequest,
} from '@/api/inspection';
import { uploadFile } from '@/api/request';
import { useUserStore } from '@/stores/user';
import { onLoad } from '@dcloudio/uni-app';

interface WorkOrderItem {
  workOrderNumber: string;
  projectName: string;
  quantity: number;
}

interface BomPartItem {
  id: string;
  partName: string;
  partNumber: string;
}

interface TeamItem {
  group: string;
  label: string;
  value: string;
}

interface AttachmentItem {
  url: string;
  name: string;
}

interface FormState {
  workOrderNumber: string;
  processName: string;
  componentName: string;
  partName: string;
  quantity: null | number;
  team: string;
  reporter: string;
  selfCheckResult: string;
  mutualCheckResult: string;
  requestInfo: string;
  attachments: AttachmentItem[];
}

const CHECK_RESULT_OPTIONS = ['PASS', 'FAIL', 'NA'];
const OPTIONAL_COMPONENT_PROCESSES = new Set(['装配', '进货检验']);

const userStore = useUserStore();

const form = reactive<FormState>({
  workOrderNumber: '',
  processName: '',
  componentName: '',
  partName: '',
  quantity: null,
  team: '',
  reporter: '',
  selfCheckResult: '',
  mutualCheckResult: '',
  requestInfo: '',
  attachments: [],
});

// Error flags
const errors = reactive({
  workOrderNumber: false,
  processName: false,
  componentName: false,
  reporter: false,
  team: false,
  attachments: false,
});

// Search state
const workOrderKeyword = ref('');
const workOrderResults = ref<WorkOrderItem[]>([]);
const showWorkOrderDropdown = ref(false);
const searchingWorkOrder = ref(false);
let searchTimer: null | ReturnType<typeof setTimeout> = null;

// Cascade data
const processList = ref<string[]>([]);
const bomPartList = ref<BomPartItem[]>([]);
const teamList = ref<TeamItem[]>([]);

// Picker indices
const processIndex = ref(-1);
const bomPartIndex = ref(-1);
const teamIndex = ref(-1);
const selfCheckIndex = ref(-1);
const mutualCheckIndex = ref(-1);

// Derived picker range labels
const bomPartLabels = computed(() =>
  bomPartList.value.map((p) => `${p.partName} (${p.partNumber})`),
);
const teamLabels = computed(() => teamList.value.map((t) => t.label));

// Whether componentName is required
const componentRequired = computed(
  () => !OPTIONAL_COMPONENT_PROCESSES.has(form.processName),
);

const submitting = ref(false);
const uploadingPhoto = ref(false);

onLoad(async () => {
  userStore.checkAuth();
  if (userStore.userInfo?.realName) {
    form.reporter = userStore.userInfo.realName;
  }
  await loadTeams();
});

async function loadTeams() {
  const res = await getTeams();
  if (res.code === 0 && Array.isArray(res.data)) {
    teamList.value = res.data;
  }
}

function onWorkOrderInput(e: { detail: { value: string } }) {
  const keyword = e.detail.value;
  workOrderKeyword.value = keyword;
  errors.workOrderNumber = false;

  if (!keyword.trim()) {
    workOrderResults.value = [];
    showWorkOrderDropdown.value = false;
    return;
  }

  if (searchTimer !== null) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    doSearchWorkOrders(keyword.trim());
  }, 500);
}

async function doSearchWorkOrders(keyword: string) {
  searchingWorkOrder.value = true;
  try {
    const res = await searchWorkOrders(keyword);
    if (res.code === 0 && res.data?.items) {
      workOrderResults.value = res.data.items;
      showWorkOrderDropdown.value = res.data.items.length > 0;
    }
  } catch {
    workOrderResults.value = [];
  } finally {
    searchingWorkOrder.value = false;
  }
}

async function selectWorkOrder(item: WorkOrderItem) {
  form.workOrderNumber = item.workOrderNumber;
  workOrderKeyword.value = item.workOrderNumber;
  showWorkOrderDropdown.value = false;
  workOrderResults.value = [];
  errors.workOrderNumber = false;

  // Pre-fill quantity
  form.quantity = item.quantity;

  // Clear downstream selections
  form.processName = '';
  form.componentName = '';
  form.partName = '';
  processIndex.value = -1;
  bomPartIndex.value = -1;
  processList.value = [];
  bomPartList.value = [];

  // Load cascade data
  const [procRes, partsRes] = await Promise.all([
    getProcesses(item.workOrderNumber),
    getBomParts(item.workOrderNumber),
  ]);
  if (procRes.code === 0 && Array.isArray(procRes.data)) {
    processList.value = procRes.data.map((p) => p.processName);
  }
  if (partsRes.code === 0 && Array.isArray(partsRes.data)) {
    bomPartList.value = partsRes.data;
  }
}

function onProcessChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  processIndex.value = idx;
  form.processName = processList.value[idx] ?? '';
  errors.processName = false;
  // Reset component/part when process changes
  form.componentName = '';
  form.partName = '';
  bomPartIndex.value = -1;
}

function onBomPartChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  bomPartIndex.value = idx;
  const part = bomPartList.value[idx];
  if (part) {
    form.componentName = part.partName;
    form.partName = part.partName;
    errors.componentName = false;
  }
}

function onTeamChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  teamIndex.value = idx;
  form.team = teamList.value[idx]?.value ?? '';
  errors.team = false;
}

function onSelfCheckChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  selfCheckIndex.value = idx;
  form.selfCheckResult = CHECK_RESULT_OPTIONS[idx] ?? '';
}

function onMutualCheckChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  mutualCheckIndex.value = idx;
  form.mutualCheckResult = CHECK_RESULT_OPTIONS[idx] ?? '';
}

function dismissDropdown() {
  showWorkOrderDropdown.value = false;
}

async function handleAddPhoto() {
  if (uploadingPhoto.value) return;
  if (form.attachments.length >= 6) {
    uni.showToast({ title: '最多上传6张图片', icon: 'none' });
    return;
  }
  const remaining = 6 - form.attachments.length;
  try {
    const res = await new Promise<UniApp.ChooseImageSuccessCallbackResult>(
      (resolve, reject) => {
        uni.chooseImage({
          count: remaining,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: reject,
        });
      },
    );
    uploadingPhoto.value = true;
    uni.showLoading({ title: '上传中...' });
    for (const path of res.tempFilePaths) {
      const uploadRes = await uploadFile(path);
      if (uploadRes.code === 0 && uploadRes.data?.url) {
        const fileName = path.split('/').pop() ?? 'photo';
        form.attachments.push({ url: uploadRes.data.url, name: fileName });
        errors.attachments = false;
      }
    }
  } catch {
    uni.showToast({ title: '图片上传失败', icon: 'none' });
  } finally {
    uploadingPhoto.value = false;
    uni.hideLoading();
  }
}

function handleRemovePhoto(index: number) {
  form.attachments.splice(index, 1);
}

function validate(): boolean {
  errors.workOrderNumber = !form.workOrderNumber;
  errors.processName = !form.processName;
  errors.componentName = componentRequired.value && !form.componentName;
  errors.reporter = !form.reporter.trim();
  errors.team = !form.team;
  errors.attachments = form.attachments.length === 0;
  return (
    !errors.workOrderNumber &&
    !errors.processName &&
    !errors.componentName &&
    !errors.reporter &&
    !errors.team &&
    !errors.attachments
  );
}

async function handleSubmit() {
  if (!validate()) {
    uni.showToast({ title: '请填写必填项', icon: 'none' });
    return;
  }
  if (submitting.value) return;
  submitting.value = true;
  uni.showLoading({ title: '提交中...' });
  try {
    const payload: Record<string, unknown> = {
      workOrderNumber: form.workOrderNumber,
      processName: form.processName,
      reporter: form.reporter.trim(),
      team: form.team,
      attachments: form.attachments,
    };
    if (form.quantity !== null) payload.quantity = form.quantity;
    if (form.componentName) payload.componentName = form.componentName;
    if (form.partName) payload.partName = form.partName;
    if (form.selfCheckResult) payload.selfCheckResult = form.selfCheckResult;
    if (form.mutualCheckResult)
      payload.mutualCheckResult = form.mutualCheckResult;
    if (form.requestInfo.trim()) payload.requestInfo = form.requestInfo.trim();

    const res = await submitInspectionRequest(payload);
    if (res.code !== 0) throw new Error(res.message || '提交失败');
    uni.showToast({ title: '报检提交成功', icon: 'success', duration: 2000 });
    setTimeout(() => {
      uni.navigateBack();
    }, 1500);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '提交失败，请重试';
    uni.showToast({ title: msg, icon: 'none', duration: 2500 });
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
}
</script>

<template>
  <view class="page" @tap="dismissDropdown">
    <scroll-view class="scroll-body" scroll-y>
      <view class="card">
        <!-- 工单号 — searchable -->
        <view class="form-item" :class="{ error: errors.workOrderNumber }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">工单号</text>
          </view>
          <view class="search-wrap">
            <input
              class="input"
              :value="workOrderKeyword"
              placeholder="搜索工单号"
              placeholder-class="input-placeholder"
              @input="onWorkOrderInput"
              @tap.stop
            />
            <view v-if="searchingWorkOrder" class="search-loading">
              <text class="search-loading-text">搜索中...</text>
            </view>
            <view v-if="showWorkOrderDropdown" class="dropdown" @tap.stop>
              <view
                v-for="item in workOrderResults"
                :key="item.workOrderNumber"
                class="dropdown-item"
                @tap="selectWorkOrder(item)"
              >
                <text class="dropdown-item-title">{{
                  item.workOrderNumber
                }}</text>
                <text class="dropdown-item-sub">{{ item.projectName }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 工序 -->
        <view class="form-item" :class="{ error: errors.processName }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">工序</text>
          </view>
          <picker
            class="picker"
            mode="selector"
            :range="processList"
            :value="processIndex"
            :disabled="processList.length === 0"
            @change="onProcessChange"
          >
            <view class="picker-inner">
              <text
                class="picker-text"
                :class="{ 'picker-placeholder': !form.processName }"
              >
                {{
                  form.processName ||
                  (processList.length === 0 ? '请先选择工单号' : '请选择工序')
                }}
              </text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 部件名称 -->
        <view class="form-item" :class="{ error: errors.componentName }">
          <view class="label-wrap">
            <text v-if="componentRequired" class="required-star">*</text>
            <text v-else class="label-spacer" />
            <text class="label">部件名称</text>
          </view>
          <picker
            class="picker"
            mode="selector"
            :range="bomPartLabels"
            :value="bomPartIndex"
            :disabled="bomPartList.length === 0"
            @change="onBomPartChange"
          >
            <view class="picker-inner">
              <text
                class="picker-text"
                :class="{ 'picker-placeholder': !form.componentName }"
              >
                {{
                  form.componentName ||
                  (bomPartList.length === 0
                    ? '请先选择工单号'
                    : `请选择部件${componentRequired ? '' : '（选填）'}`)
                }}
              </text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 数量 -->
        <view class="form-item">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">数量</text>
          </view>
          <input
            class="input"
            type="digit"
            :value="form.quantity !== null ? String(form.quantity) : ''"
            placeholder="请输入数量"
            placeholder-class="input-placeholder"
            @input="
              (e: { detail: { value: string } }) => {
                form.quantity = e.detail.value ? Number(e.detail.value) : null;
              }
            "
          />
        </view>

        <!-- 班组 -->
        <view class="form-item" :class="{ error: errors.team }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">班组</text>
          </view>
          <picker
            class="picker"
            mode="selector"
            :range="teamLabels"
            :value="teamIndex"
            :disabled="teamList.length === 0"
            @change="onTeamChange"
          >
            <view class="picker-inner">
              <text
                class="picker-text"
                :class="{ 'picker-placeholder': !form.team }"
              >
                {{
                  teamList.find((t) => t.value === form.team)?.label ||
                  '请选择班组'
                }}
              </text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 报检人 -->
        <view class="form-item" :class="{ error: errors.reporter }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">报检人</text>
          </view>
          <input
            v-model="form.reporter"
            class="input"
            placeholder="请输入报检人"
            placeholder-class="input-placeholder"
            @input="errors.reporter = false"
          />
        </view>

        <!-- 自检结果 -->
        <view class="form-item">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">自检结果</text>
          </view>
          <picker
            class="picker"
            mode="selector"
            :range="CHECK_RESULT_OPTIONS"
            :value="selfCheckIndex"
            @change="onSelfCheckChange"
          >
            <view class="picker-inner">
              <text
                class="picker-text"
                :class="{ 'picker-placeholder': !form.selfCheckResult }"
              >
                {{ form.selfCheckResult || '请选择（选填）' }}
              </text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 互检结果 -->
        <view class="form-item">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">互检结果</text>
          </view>
          <picker
            class="picker"
            mode="selector"
            :range="CHECK_RESULT_OPTIONS"
            :value="mutualCheckIndex"
            @change="onMutualCheckChange"
          >
            <view class="picker-inner">
              <text
                class="picker-text"
                :class="{ 'picker-placeholder': !form.mutualCheckResult }"
              >
                {{ form.mutualCheckResult || '请选择（选填）' }}
              </text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 附件 -->
        <view
          class="form-item form-item--attach"
          :class="{ error: errors.attachments }"
        >
          <view class="label-wrap label-wrap--top">
            <text class="required-star">*</text>
            <text class="label">自检记录</text>
          </view>
          <view class="photo-grid">
            <view
              v-for="(att, idx) in form.attachments"
              :key="att.url"
              class="photo-item"
            >
              <image class="photo-thumb" :src="att.url" mode="aspectFill" />
              <view class="photo-remove" @tap="handleRemovePhoto(idx)">
                <text class="photo-remove-icon">×</text>
              </view>
            </view>
            <view
              v-if="form.attachments.length < 6"
              class="photo-add"
              @tap="handleAddPhoto"
            >
              <text class="photo-add-icon">+</text>
              <text class="photo-add-text">添加照片</text>
            </view>
          </view>
          <text v-if="errors.attachments" class="field-error-tip"
            >请至少上传1张图片</text
          >
        </view>

        <!-- 补充说明 -->
        <view class="form-item form-item--textarea">
          <view class="label-wrap label-wrap--top">
            <text class="label-spacer" />
            <text class="label">补充说明</text>
          </view>
          <textarea
            v-model="form.requestInfo"
            class="textarea"
            placeholder="请输入补充说明（选填）"
            placeholder-class="input-placeholder"
            :maxlength="500"
            auto-height
          ></textarea>
        </view>
      </view>
    </scroll-view>

    <!-- Fixed submit button -->
    <view class="footer">
      <button
        class="btn-submit"
        :disabled="submitting"
        :loading="submitting"
        @tap="handleSubmit"
      >
        提交报检
      </button>
    </view>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: $bg-color;
}

.scroll-body {
  flex: 1;
  padding-bottom: 160rpx;
}

.card {
  margin: 24rpx;
  overflow: visible;
  background: #fff;
  border-radius: 16rpx;
}

/* ---- Form items ---- */
.form-item {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 96rpx;
  padding: 0 28rpx;
  border-bottom: 1rpx solid $border-color;

  &:last-child {
    border-bottom: none;
  }

  &.error .input,
  &.error .picker {
    border-color: $error-color;
  }

  &--textarea {
    align-items: flex-start;
    padding-top: 24rpx;
    padding-bottom: 24rpx;
  }

  &--attach {
    flex-direction: column;
    align-items: flex-start;
    padding-top: 24rpx;
    padding-bottom: 24rpx;
  }
}

.label-wrap {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: 160rpx;

  &--top {
    align-items: flex-start;
    padding-top: 4rpx;
  }
}

.required-star {
  margin-right: 6rpx;
  font-size: 28rpx;
  line-height: 1;
  color: $error-color;
}

.label-spacer {
  width: 18rpx;
}

.label {
  font-size: 28rpx;
  color: $text-color;
}

/* ---- Input ---- */
.input {
  flex: 1;
  height: 64rpx;
  padding: 0 8rpx;
  font-size: 28rpx;
  color: $text-color;
  background: transparent;
  border: 2rpx solid transparent;
  border-radius: 8rpx;
}

.input-placeholder {
  color: #bfbfbf;
}

/* ---- Work order search ---- */
.search-wrap {
  position: relative;
  flex: 1;
}

.search-loading {
  padding: 8rpx 8rpx 0;
}

.search-loading-text {
  font-size: 24rpx;
  color: #999;
}

.dropdown {
  position: absolute;
  top: 72rpx;
  left: 0;
  z-index: 100;
  width: 100%;
  max-height: 400rpx;
  overflow-y: auto;
  background: #fff;
  border: 1rpx solid $border-color;
  border-radius: 8rpx;
  box-shadow: 0 8rpx 24rpx rgb(0 0 0 / 10%);
}

.dropdown-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid $border-color;

  &:last-child {
    border-bottom: none;
  }
}

.dropdown-item-title {
  font-size: 28rpx;
  font-weight: 500;
  color: $text-color;
}

.dropdown-item-sub {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: $text-color-secondary;
}

/* ---- Picker ---- */
.picker {
  flex: 1;
  border: 2rpx solid transparent;
  border-radius: 8rpx;
}

.picker-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64rpx;
  padding: 0 8rpx;
}

.picker-text {
  font-size: 28rpx;
  color: $text-color;
}

.picker-placeholder {
  color: #bfbfbf;
}

.picker-arrow {
  font-size: 36rpx;
  line-height: 1;
  color: #bfbfbf;
}

/* ---- Textarea ---- */
.textarea {
  flex: 1;
  min-height: 120rpx;
  padding: 8rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: $text-color;
}

/* ---- Photo grid ---- */
.photo-grid {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 16rpx;
  width: 100%;
  margin-top: 4rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  overflow: hidden;
  border-radius: 8rpx;
}

.photo-thumb {
  width: 100%;
  height: 100%;
}

.photo-remove {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  background: rgb(0 0 0 / 50%);
  border-bottom-left-radius: 8rpx;
}

.photo-remove-icon {
  font-size: 32rpx;
  line-height: 1;
  color: #fff;
}

.photo-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200rpx;
  height: 200rpx;
  border: 2rpx dashed $border-color;
  border-radius: 8rpx;
}

.photo-add-icon {
  font-size: 56rpx;
  line-height: 1;
  color: #bfbfbf;
}

.photo-add-text {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #bfbfbf;
}

.field-error-tip {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $error-color;
}

/* ---- Footer ---- */
.footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 16rpx 32rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid $border-color;
}

.btn-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
  background: $primary-color;
  border: none;
  border-radius: 16rpx;

  &[disabled] {
    opacity: 0.6;
  }
}
</style>
