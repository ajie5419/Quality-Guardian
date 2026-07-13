<script setup lang="ts">
import type { InspectionIssueRecord } from '@/api/issues';

import { onMounted } from 'vue';

import { INSPECTION_ISSUE_FIELD_LIMITS } from '@qgs/shared';

import IssuePhotoField from './IssuePhotoField.vue';
import { useIssueForm } from './useIssueForm';

const props = defineProps<{
  initialData?: InspectionIssueRecord;
  mode: 'create' | 'edit';
}>();
const emit = defineEmits<{
  cancel: [];
  success: [InspectionIssueRecord | null];
}>();

const {
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
} = useIssueForm(props, { success: (issue) => emit('success', issue) });

onMounted(initialize);
</script>

<template>
  <view class="issue-form-page">
    <view class="step-bar">
      <view v-for="step in 3" :key="step" class="step-item">
        <view class="step-dot" :class="{ active: step <= currentStep }">
          {{ step }}
        </view>
        <text :class="{ active: step === currentStep }">
          {{ ['基本信息', '责任与分类', '分析与照片'][step - 1] }}
        </text>
      </view>
    </view>

    <scroll-view scroll-y class="form-scroll">
      <view v-show="currentStep === 1" class="form-card">
        <view class="field">
          <text class="label">不合格单号</text>
          <view class="readonly-value">{{
            form.ncNumber || '提交后自动生成'
          }}</view>
        </view>
        <view class="field">
          <text class="label required">发现日期</text>
          <picker mode="date" :value="form.reportDate" @change="onDateChange">
            <view class="picker-value">{{ form.reportDate }}</view>
          </picker>
        </view>
        <view class="field search-field">
          <text class="label required">工单号</text>
          <input
            class="input"
            :value="form.workOrderNumber"
            :maxlength="INSPECTION_ISSUE_FIELD_LIMITS.SHORT_TEXT"
            placeholder="输入工单号搜索"
            @input="onWorkOrderInput"
            @tap.stop
          />
          <text v-if="searching" class="field-tip">搜索中...</text>
          <view v-if="showWorkOrderResults" class="search-results">
            <view
              v-for="item in workOrderResults"
              :key="item.workOrderNumber"
              class="search-result"
              @tap="selectWorkOrder(item)"
            >
              <text>{{ item.workOrderNumber }}</text>
              <text class="result-sub">{{ item.projectName }}</text>
            </view>
          </view>
        </view>
        <view class="field">
          <text class="label">项目名称</text>
          <view class="readonly-value">{{ form.projectName || '-' }}</view>
        </view>
        <view class="field">
          <text class="label required">部件名称</text>
          <input
            v-model="form.partName"
            class="input"
            :maxlength="INSPECTION_ISSUE_FIELD_LIMITS.SHORT_TEXT"
            placeholder="请输入部件名称"
          />
        </view>
        <view class="field">
          <text class="label required">工序</text>
          <picker
            :range="processOptions"
            range-key="label"
            @change="onProcessChange"
          >
            <view
              class="picker-value"
              :class="{ placeholder: !form.processName }"
            >
              {{ selectedProcessLabel || '请选择工序' }}
            </view>
          </picker>
        </view>
        <view class="field">
          <text class="label required">数量</text>
          <input v-model.number="form.quantity" class="input" type="number" />
        </view>
        <view class="field">
          <text class="label">检验员</text>
          <input
            v-model="form.inspector"
            class="input"
            :maxlength="INSPECTION_ISSUE_FIELD_LIMITS.SHORT_TEXT"
            placeholder="请输入检验员"
          />
        </view>
      </view>

      <view v-show="currentStep === 2" class="form-card">
        <view class="field">
          <text class="label required">责任部门</text>
          <view class="picker-value" @tap="showDepartments = !showDepartments">
            {{ selectedDepartmentNames || '请选择责任部门' }}
          </view>
          <checkbox-group
            v-if="showDepartments"
            class="department-list"
            @change="onDepartmentChange"
          >
            <label v-for="dept in departments" :key="dept.id" class="check-row">
              <checkbox
                :value="dept.id"
                :checked="form.responsibleDepartments.includes(dept.id)"
                color="#1890ff"
              />
              <text>{{ dept.name }}</text>
            </label>
          </checkbox-group>
        </view>
        <view v-if="requiresSupplier" class="field">
          <text class="label required">责任单位</text>
          <picker
            :range="supplierPickerOptions"
            range-key="label"
            @change="onSupplierChange"
          >
            <view
              class="picker-value"
              :class="{ placeholder: !form.supplierName }"
            >
              {{
                supplierPickerOptions.find(
                  (item) => item.value === form.supplierName,
                )?.label || '请选择责任单位'
              }}
            </view>
          </picker>
        </view>
        <view v-if="requiresWelder" class="field">
          <text class="label required">责任焊工</text>
          <picker
            :range="welderPickerOptions"
            range-key="label"
            @change="onWelderChange"
          >
            <view
              class="picker-value"
              :class="{ placeholder: !form.responsibleWelder }"
            >
              {{
                welderPickerOptions.find(
                  (item) => item.value === form.responsibleWelder,
                )?.label || '请选择责任焊工'
              }}
            </view>
          </picker>
        </view>
        <view class="field">
          <text class="label required">状态</text>
          <picker
            :range="ISSUE_STATUS_OPTIONS"
            range-key="label"
            @change="onStatusChange"
          >
            <view class="picker-value">
              {{
                ISSUE_STATUS_OPTIONS.find((item) => item.value === form.status)
                  ?.label
              }}
            </view>
          </picker>
        </view>
        <view class="field">
          <text class="label required">严重程度</text>
          <picker
            :range="ISSUE_SEVERITY_OPTIONS"
            range-key="label"
            @change="onSeverityChange"
          >
            <view class="picker-value">
              {{
                ISSUE_SEVERITY_OPTIONS.find(
                  (item) => item.value === form.severity,
                )?.label
              }}
            </view>
          </picker>
        </view>
        <view class="field">
          <text class="label required">缺陷分类</text>
          <picker :range="ISSUE_DEFECT_TYPES" @change="onDefectTypeChange">
            <view class="picker-value">{{ form.defectType }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label required">缺陷子类</text>
          <picker :range="defectSubtypeOptions" @change="onDefectSubtypeChange">
            <view class="picker-value">{{ form.defectSubtype }}</view>
          </picker>
        </view>
        <view class="field">
          <text class="label">损失金额</text>
          <input v-model.number="form.lossAmount" class="input" type="digit" />
        </view>
        <view class="field">
          <text class="label">是否索赔</text>
          <picker
            :range="ISSUE_CLAIM_OPTIONS"
            range-key="label"
            @change="onClaimChange"
          >
            <view class="picker-value">
              {{
                ISSUE_CLAIM_OPTIONS.find((item) => item.value === form.claim)
                  ?.label
              }}
            </view>
          </picker>
        </view>
      </view>

      <view v-show="currentStep === 3" class="form-card">
        <view class="field">
          <text class="label required">不合格描述</text>
          <textarea
            v-model="form.description"
            class="textarea"
            :maxlength="INSPECTION_ISSUE_FIELD_LIMITS.DESCRIPTION"
            placeholder="请输入不合格描述"
          ></textarea>
        </view>
        <view class="field">
          <text class="label required">原因分析</text>
          <textarea
            v-model="form.rootCause"
            class="textarea"
            :maxlength="INSPECTION_ISSUE_FIELD_LIMITS.DESCRIPTION"
            placeholder="请输入原因分析"
          ></textarea>
        </view>
        <view class="field">
          <text class="label required">解决方案</text>
          <textarea
            v-model="form.solution"
            class="textarea"
            :maxlength="INSPECTION_ISSUE_FIELD_LIMITS.DESCRIPTION"
            placeholder="请输入解决方案"
          ></textarea>
        </view>
        <IssuePhotoField v-model="form.photos" />
      </view>

      <view class="draft-actions">
        <button class="draft-button" @tap="clearDraft">清除草稿</button>
      </view>
    </scroll-view>

    <view class="bottom-actions">
      <button
        v-if="currentStep > 1"
        class="secondary-button"
        @tap="previousStep"
      >
        上一步
      </button>
      <button v-else class="secondary-button" @tap="emit('cancel')">
        取消
      </button>
      <button v-if="currentStep < 3" class="primary-button" @tap="nextStep">
        下一步
      </button>
      <button
        v-else
        class="primary-button"
        :loading="submitting"
        :disabled="submitting"
        @tap="submit"
      >
        保存
      </button>
    </view>
  </view>
</template>

<style lang="scss" src="./issue-form.scss"></style>
