<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  closeInspectionRequest,
  getDepartments,
  getInspectionRequest,
} from '@/api/inspection';
import { buildResourceUrl, uploadFile } from '@/api/request';
import { onLoad } from '@dcloudio/uni-app';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskDetail {
  requestNo: string;
  workOrderNumber: string;
  partName: string;
  processName: string;
  quantity: number;
}

interface Attachment {
  name: string;
  url: string;
}

interface Department {
  id: string;
  name: string;
}

// ─── Defect option maps ───────────────────────────────────────────────────────

const DEFECT_TYPES = [
  '设计缺陷',
  '制造缺陷',
  '零部件缺陷',
  '工艺缺陷',
  '其他缺陷',
];

const DEFECT_SUBTYPE_MAP: Record<string, string[]> = {
  设计缺陷: ['机械设计', '液压设计', '电气设计', '其他'],
  制造缺陷: [
    '焊接缺陷',
    '加工尺寸偏差',
    '漏加工',
    '制造干涉',
    '安装错位',
    '漏油渗油',
    '紧固件松动',
    '其他',
  ],
  零部件缺陷: ['功能失效', '元器件故障', '本身质量问题', '其他'],
  工艺缺陷: ['加工精度缺陷', '其他'],
  其他缺陷: ['加工精度缺陷', '其他'],
};

const SEVERITY_OPTIONS = ['Minor-轻微', 'Major-严重', 'Critical-重大'];

// ─── State ───────────────────────────────────────────────────────────────────

const taskId = ref('');
const task = ref<null | TaskDetail>(null);
const loading = ref(false);
const submitting = ref(false);
const departments = ref<Department[]>([]);

// Step: 1-indexed; only meaningful when result === 'FAIL'
const currentStep = ref(1);

// ── Step 1 fields ─────────────────────────────────────────────────────────────
const result = ref<'FAIL' | 'PASS'>('PASS');
const quantity = ref(1);
const unqualifiedQuantity = ref(0);
const hasDocuments = ref(true);
const attachments = ref<Attachment[]>([]);
const closeRemark = ref('');

// ── Step 2 fields ─────────────────────────────────────────────────────────────
const defectType = ref('制造缺陷');
const defectSubtype = ref('焊接缺陷');
const severity = ref('Minor-轻微');
const responsibleDepartment = ref('');

// ── Step 3 fields ─────────────────────────────────────────────────────────────
const description = ref('');
const rootCause = ref('');
const solution = ref('');
const lossAmount = ref(0);

// ─── Derived ─────────────────────────────────────────────────────────────────

const isFail = computed(() => result.value === 'FAIL');
const totalSteps = computed(() => (isFail.value ? 3 : 1));

const currentSubtypeOptions = computed(
  () => DEFECT_SUBTYPE_MAP[defectType.value] ?? ['其他'],
);

const departmentNames = computed(() => departments.value.map((d) => d.name));

// ─── Watchers ────────────────────────────────────────────────────────────────

// Reset subtype when defect type changes
watch(defectType, (newType) => {
  const opts = DEFECT_SUBTYPE_MAP[newType] ?? ['其他'];
  defectSubtype.value = opts[0] ?? '其他';
});

// When switching back to PASS, go back to step 1
watch(result, (val) => {
  if (val === 'PASS') currentStep.value = 1;
});

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchDetail() {
  loading.value = true;
  try {
    const res = await getInspectionRequest(taskId.value);
    if (res.code === 0) {
      const d = res.data as Record<string, unknown>;
      task.value = {
        requestNo: (d.requestNo as string) || '',
        workOrderNumber: (d.workOrderNumber as string) || '',
        partName: ((d.partName ?? d.componentName) as string) || '',
        processName: (d.processName as string) || '',
        quantity: (d.quantity as number) || 1,
      };
      quantity.value = task.value.quantity;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function fetchDepartments() {
  try {
    const res = await getDepartments();
    if (res.code === 0 && Array.isArray(res.data)) {
      departments.value = res.data;
      if (res.data.length > 0) {
        responsibleDepartment.value = res.data[0]?.name ?? '';
      }
    }
  } catch {
    // Non-fatal: leave departments empty, user can still submit
  }
}

// ─── Photo upload ─────────────────────────────────────────────────────────────

function removeAttachment(idx: number) {
  attachments.value.splice(idx, 1);
}

function choosePhoto() {
  const remaining = 3 - attachments.value.length;
  if (remaining <= 0) return;

  uni.chooseImage({
    count: remaining,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: async (res) => {
      uni.showLoading({ title: '上传中...' });
      try {
        for (const path of res.tempFilePaths) {
          const uploadRes = await uploadFile(path);
          if (uploadRes.code === 0 && uploadRes.data?.url) {
            const fileName = path.split('/').pop() || 'photo.jpg';
            attachments.value.push({ url: uploadRes.data.url, name: fileName });
          } else {
            uni.showToast({ title: '上传失败', icon: 'none' });
          }
        }
      } catch {
        uni.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        uni.hideLoading();
      }
    },
  });
}

// ─── Picker handlers ──────────────────────────────────────────────────────────

function onDefectTypeChange(e: { detail: { value: string } }) {
  defectType.value = DEFECT_TYPES[Number(e.detail.value)] ?? DEFECT_TYPES[0];
}

function onDefectSubtypeChange(e: { detail: { value: string } }) {
  const opts = currentSubtypeOptions.value;
  defectSubtype.value = opts[Number(e.detail.value)] ?? opts[0];
}

function onSeverityChange(e: { detail: { value: string } }) {
  severity.value =
    SEVERITY_OPTIONS[Number(e.detail.value)] ?? SEVERITY_OPTIONS[0];
}

function onDepartmentChange(e: { detail: { value: string } }) {
  responsibleDepartment.value =
    departmentNames.value[Number(e.detail.value)] ?? '';
}

// ─── Step navigation ──────────────────────────────────────────────────────────

function validateStep1(): boolean {
  if (attachments.value.length === 0) {
    uni.showToast({ title: '请至少上传一张检验记录照片', icon: 'none' });
    return false;
  }
  if (isFail.value && unqualifiedQuantity.value <= 0) {
    uni.showToast({ title: '不合格数量必须大于0', icon: 'none' });
    return false;
  }
  return true;
}

function validateStep2(): boolean {
  if (!responsibleDepartment.value) {
    uni.showToast({ title: '请选择责任部门', icon: 'none' });
    return false;
  }
  return true;
}

function validateStep3(): boolean {
  if (!description.value.trim()) {
    uni.showToast({ title: '请填写不合格描述', icon: 'none' });
    return false;
  }
  if (!rootCause.value.trim()) {
    uni.showToast({ title: '请填写原因分析', icon: 'none' });
    return false;
  }
  if (!solution.value.trim()) {
    uni.showToast({ title: '请填写解决方案', icon: 'none' });
    return false;
  }
  return true;
}

function goNext() {
  if (currentStep.value === 1 && !validateStep1()) return;
  if (currentStep.value === 2 && !validateStep2()) return;
  currentStep.value += 1;
}

function goPrev() {
  if (currentStep.value > 1) currentStep.value -= 1;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitResult() {
  if (!task.value || submitting.value) return;

  if (isFail.value) {
    if (!validateStep3()) return;
  } else {
    if (!validateStep1()) return;
  }

  submitting.value = true;
  uni.showLoading({ title: '提交中...' });

  const qty = quantity.value;
  const unqualified = isFail.value ? unqualifiedQuantity.value : 0;

  const payload: Record<string, unknown> = {
    result: result.value,
    attachments: attachments.value,
    quantity: qty,
    qualifiedQuantity: isFail.value ? 0 : qty,
    unqualifiedQuantity: unqualified,
    hasDocuments: hasDocuments.value,
    closeRemark: closeRemark.value || undefined,
  };

  if (isFail.value && task.value) {
    const severityCode = severity.value.split('-')[0] ?? 'Minor';
    payload.linkedIssue = {
      partName: task.value.partName,
      processName: task.value.processName,
      responsibleDepartment: responsibleDepartment.value,
      defectType: defectType.value,
      defectSubtype: defectSubtype.value,
      severity: severityCode,
      status: 'OPEN',
      description: description.value,
      rootCause: rootCause.value,
      solution: solution.value,
      quantity: unqualified,
      lossAmount: lossAmount.value,
    };
  }

  try {
    const res = await closeInspectionRequest(
      taskId.value,
      payload as Parameters<typeof closeInspectionRequest>[1],
    );
    uni.hideLoading();
    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' });
    }
  } catch {
    uni.hideLoading();
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onLoad((options) => {
  taskId.value = options?.id ?? '';
  fetchDetail();
  fetchDepartments();
});
</script>

<template>
  <view class="page">
    <!-- Task info header -->
    <view v-if="task" class="detail-card">
      <view class="detail-row">
        <text class="detail-label">编号</text>
        <text class="detail-value">{{ task.requestNo }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">工单号</text>
        <text class="detail-value">{{ task.workOrderNumber }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">零件</text>
        <text class="detail-value">{{ task.partName }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">工序</text>
        <text class="detail-value">{{ task.processName }}</text>
      </view>
    </view>

    <!-- Step indicator (only for FAIL multi-step) -->
    <view v-if="isFail" class="step-bar">
      <view
        v-for="n in 3"
        :key="n"
        class="step-item"
        :class="{
          'step-item--active': n === currentStep,
          'step-item--done': n < currentStep,
        }"
      >
        <view class="step-circle">
          <text class="step-num">{{ n }}</text>
        </view>
        <text class="step-label">{{
          ['基本信息', '不合格品信息', '补充信息'][n - 1]
        }}</text>
      </view>
      <view
        class="step-line step-line--1"
        :class="{ 'step-line--done': currentStep > 1 }"
      />
      <view
        class="step-line step-line--2"
        :class="{ 'step-line--done': currentStep > 2 }"
      />
    </view>

    <!-- Scrollable content area -->
    <scroll-view scroll-y class="scroll">
      <!-- ── STEP 1 / PASS single step ─────────────────────────────────── -->
      <view v-show="currentStep === 1">
        <!-- 检验结果 -->
        <view class="card">
          <view class="field-label required">检验结果</view>
          <view class="segmented">
            <view
              class="seg-btn"
              :class="{
                'seg-btn--pass': result === 'PASS',
                'seg-btn--active': result === 'PASS',
              }"
              @tap="result = 'PASS'"
            >
              <text>PASS</text>
            </view>
            <view
              class="seg-btn"
              :class="{
                'seg-btn--fail': result === 'FAIL',
                'seg-btn--active': result === 'FAIL',
              }"
              @tap="result = 'FAIL'"
            >
              <text>FAIL</text>
            </view>
          </view>
        </view>

        <!-- 数量 -->
        <view class="card">
          <view class="field-label required">数量</view>
          <input
            v-model.number="quantity"
            class="text-input"
            type="number"
            placeholder="请输入数量"
          />
        </view>

        <!-- 不合格数量 (FAIL only) -->
        <view v-if="isFail" class="card">
          <view class="field-label required">不合格数量</view>
          <input
            v-model.number="unqualifiedQuantity"
            class="text-input"
            type="number"
            placeholder="请输入不合格数量"
          />
        </view>

        <!-- 是否有资料 -->
        <view class="card">
          <view class="field-row">
            <text class="field-label" style="margin-bottom: 0">是否有资料</text>
            <switch
              :checked="hasDocuments"
              color="#1890ff"
              @change="
                (e: { detail: { value: boolean } }) =>
                  (hasDocuments = e.detail.value)
              "
            />
            <text class="switch-label">{{ hasDocuments ? '有' : '无' }}</text>
          </view>
        </view>

        <!-- 检验记录 (photo upload) -->
        <view class="card">
          <view class="field-label required">检验记录（最多3张）</view>
          <view class="photo-grid">
            <view
              v-for="(att, idx) in attachments"
              :key="idx"
              class="photo-item"
            >
              <image
                :src="buildResourceUrl(att.url)"
                class="photo-img"
                mode="aspectFill"
              />
              <view class="photo-delete" @tap="removeAttachment(idx)">
                <text class="delete-icon">×</text>
              </view>
            </view>
            <view
              v-if="attachments.length < 3"
              class="photo-add"
              @tap="choosePhoto"
            >
              <text class="add-icon">+</text>
            </view>
          </view>
        </view>

        <!-- 关闭备注 -->
        <view class="card">
          <view class="field-label">关闭备注</view>
          <textarea
            v-model="closeRemark"
            class="remark-input"
            placeholder="关闭备注（选填，最多300字）"
            :maxlength="300"
            auto-height
          ></textarea>
        </view>
      </view>

      <!-- ── STEP 2 - 不合格品信息 ─────────────────────────────────────── -->
      <view v-show="currentStep === 2">
        <!-- 缺陷分类 -->
        <view class="card">
          <view class="field-label required">缺陷分类</view>
          <picker
            :value="DEFECT_TYPES.indexOf(defectType)"
            :range="DEFECT_TYPES"
            @change="onDefectTypeChange"
          >
            <view class="picker-val">
              <text>{{ defectType }}</text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 二级分类 -->
        <view class="card">
          <view class="field-label required">二级分类</view>
          <picker
            :value="currentSubtypeOptions.indexOf(defectSubtype)"
            :range="currentSubtypeOptions"
            @change="onDefectSubtypeChange"
          >
            <view class="picker-val">
              <text>{{ defectSubtype }}</text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 严重程度 -->
        <view class="card">
          <view class="field-label required">严重程度</view>
          <picker
            :value="SEVERITY_OPTIONS.indexOf(severity)"
            :range="SEVERITY_OPTIONS"
            @change="onSeverityChange"
          >
            <view class="picker-val">
              <text>{{ severity }}</text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 责任部门 -->
        <view class="card">
          <view class="field-label required">责任部门</view>
          <picker
            v-if="departmentNames.length > 0"
            :value="departmentNames.indexOf(responsibleDepartment)"
            :range="departmentNames"
            @change="onDepartmentChange"
          >
            <view class="picker-val">
              <text>{{ responsibleDepartment || '请选择责任部门' }}</text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
          <view v-else class="picker-val picker-val--placeholder">
            <text>加载中...</text>
          </view>
        </view>
      </view>

      <!-- ── STEP 3 - 补充信息 ──────────────────────────────────────────── -->
      <view v-show="currentStep === 3">
        <!-- 不合格描述 -->
        <view class="card">
          <view class="field-label required">不合格描述</view>
          <textarea
            v-model="description"
            class="remark-input"
            placeholder="请描述不合格情况（必填，最多500字）"
            :maxlength="500"
            auto-height
          ></textarea>
        </view>

        <!-- 原因分析 -->
        <view class="card">
          <view class="field-label required">原因分析</view>
          <textarea
            v-model="rootCause"
            class="remark-input"
            placeholder="请填写原因分析（必填，最多500字）"
            :maxlength="500"
            auto-height
          ></textarea>
        </view>

        <!-- 解决方案 -->
        <view class="card">
          <view class="field-label required">解决方案</view>
          <textarea
            v-model="solution"
            class="remark-input"
            placeholder="请填写解决方案（必填，最多500字）"
            :maxlength="500"
            auto-height
          ></textarea>
        </view>

        <!-- 损失金额 -->
        <view class="card">
          <view class="field-label">损失金额（元）</view>
          <input
            v-model.number="lossAmount"
            class="text-input"
            type="digit"
            placeholder="0"
          />
        </view>
      </view>
    </scroll-view>

    <!-- Fixed action bar -->
    <view class="action-bar">
      <!-- PASS single step -->
      <button
        v-if="!isFail"
        class="btn btn-primary"
        :loading="submitting"
        :disabled="submitting || loading"
        @tap="submitResult"
      >
        提交检验结果
      </button>

      <!-- FAIL multi-step -->
      <template v-else>
        <view class="btn-row">
          <button
            v-if="currentStep > 1"
            class="btn btn-secondary"
            :disabled="submitting"
            @tap="goPrev"
          >
            上一步
          </button>
          <button
            v-if="currentStep < totalSteps"
            class="btn btn-primary"
            :disabled="submitting || loading"
            @tap="goNext"
          >
            下一步
          </button>
          <button
            v-if="currentStep === totalSteps"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @tap="submitResult"
          >
            提交
          </button>
        </view>
      </template>
    </view>
  </view>
</template>

<style lang="scss">
$primary-color: #1890ff;
$text-color: #333;
$secondary-text: #666;
$placeholder-color: #bbb;
$border-color: #e8e8e8;
$bg-page: #f5f5f5;
$bg-card: #fff;
$pass-color: #52c41a;
$fail-color: #f5222d;

.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg-page;
}

// ── Header ───────────────────────────────────────────────────────────────────

.detail-card {
  flex-shrink: 0;
  padding: 24rpx 32rpx;
  background: $primary-color;
}

.detail-row {
  display: flex;
  align-items: center;
  padding: 6rpx 0;
}

.detail-label {
  width: 120rpx;
  font-size: 26rpx;
  color: rgb(255 255 255 / 70%);
}

.detail-value {
  flex: 1;
  font-size: 28rpx;
  color: #fff;
}

// ── Step indicator ───────────────────────────────────────────────────────────

.step-bar {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-around;
  padding: 24rpx 32rpx 16rpx;
  background: $bg-card;
  border-bottom: 1rpx solid $border-color;
}

.step-item {
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-items: center;
}

.step-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  background: #e8e8e8;
  border-radius: 50%;

  .step-num {
    font-size: 26rpx;
    font-weight: 600;
    color: $secondary-text;
  }
}

.step-item--active .step-circle,
.step-item--done .step-circle {
  background: $primary-color;

  .step-num {
    color: #fff;
  }
}

.step-label {
  font-size: 22rpx;
  color: $secondary-text;
}

.step-item--active .step-label,
.step-item--done .step-label {
  color: $primary-color;
}

.step-line {
  position: absolute;
  top: 52rpx;
  width: 22%;
  height: 2rpx;
  background: $border-color;

  &--done {
    background: $primary-color;
  }

  &--1 {
    left: 28%;
  }

  &--2 {
    right: 28%;
  }
}

// ── Scroll content ────────────────────────────────────────────────────────────

.scroll {
  flex: 1;
  padding: 20rpx;
  padding-bottom: 200rpx;
  overflow: hidden;
}

.card {
  padding: 28rpx;
  margin-bottom: 20rpx;
  background: $bg-card;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);
}

.field-label {
  margin-bottom: 16rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: $text-color;

  &.required::before {
    margin-right: 6rpx;
    color: $fail-color;
    content: '*';
  }
}

.field-row {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

.switch-label {
  font-size: 26rpx;
  color: $secondary-text;
}

// ── Segmented control ────────────────────────────────────────────────────────

.segmented {
  display: flex;
  overflow: hidden;
  border: 1rpx solid $border-color;
  border-radius: 12rpx;
}

.seg-btn {
  flex: 1;
  padding: 20rpx 0;
  font-size: 28rpx;
  color: #999;
  text-align: center;
  background: #fafafa;

  &--active {
    color: #fff;
  }

  &--pass {
    background: $pass-color;
  }

  &--fail {
    background: $fail-color;
  }
}

// ── Text inputs ───────────────────────────────────────────────────────────────

.text-input {
  box-sizing: border-box;
  width: 100%;
  height: 80rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: $text-color;
  background: #f9f9f9;
  border-radius: 8rpx;
}

.remark-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 160rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: $text-color;
  background: #f9f9f9;
  border-radius: 8rpx;
}

// ── Picker ───────────────────────────────────────────────────────────────────

.picker-val {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 80rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: $text-color;
  background: #f9f9f9;
  border-radius: 8rpx;

  &--placeholder {
    color: $placeholder-color;
  }
}

.picker-arrow {
  font-size: 36rpx;
  color: $placeholder-color;
  transform: rotate(90deg);
}

// ── Photo upload ──────────────────────────────────────────────────────────────

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
}

.photo-img {
  width: 200rpx;
  height: 200rpx;
  object-fit: cover;
  border-radius: 12rpx;
}

.photo-delete {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  background: rgb(0 0 0 / 60%);
  border-radius: 50%;

  .delete-icon {
    font-size: 32rpx;
    line-height: 1;
    color: #fff;
  }
}

.photo-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200rpx;
  height: 200rpx;
  background: #fafafa;
  border: 2rpx dashed #d9d9d9;
  border-radius: 12rpx;

  .add-icon {
    font-size: 60rpx;
    color: $placeholder-color;
  }
}

// ── Action bar ────────────────────────────────────────────────────────────────

.action-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: $bg-card;
  border-top: 1rpx solid $border-color;
}

.btn-row {
  display: flex;
  gap: 24rpx;
}

.btn {
  flex: 1;
  height: 88rpx;
  font-size: 32rpx;
  border: none;
  border-radius: 44rpx;

  &.btn-primary {
    color: #fff;
    background: $primary-color;
  }

  &.btn-secondary {
    color: $primary-color;
    background: #e6f4ff;
  }

  &[disabled] {
    opacity: 0.6;
  }
}
</style>
