<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';

import { useVehicleCommissioningPage } from './composables/useVehicleCommissioningPage';

const {
  createReport,
  exportReportAsPdf,
  exportReportAsWord,
  issueEditId,
  issueForm,
  issueLogModalOpen,
  issueLogs,
  issueModalOpen,
  issueStatusOptions,
  issues,
  issuesByStatus,
  loadIssues,
  loadReports,
  loadingIssues,
  loadingReports,
  onIssueSelectionChange,
  onReportWorkOrderChange,
  onWorkOrderChange,
  openCreateIssue,
  openEditIssue,
  previewReportText,
  quickCloseIssue,
  reportForm,
  reportPreviewModalOpen,
  reportPreviewText,
  reportPreviewTitle,
  reports,
  selectedIssueIds,
  selectedReportWorkOrderValue,
  selectedWorkOrderValue,
  severityOptions,
  submitIssue,
  viewIssueLogs,
} = useVehicleCommissioningPage();
</script>

<template>
  <Page content-class="p-4">
    <div class="space-y-4">
      <Card title="车辆调试执行概览">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="rounded border p-3">
            <div class="text-xs text-gray-500">待处理</div>
            <div class="text-xl font-semibold text-orange-500">
              {{ issuesByStatus.OPEN }}
            </div>
          </div>
          <div class="rounded border p-3">
            <div class="text-xs text-gray-500">处理中</div>
            <div class="text-xl font-semibold text-blue-500">
              {{ issuesByStatus.IN_PROGRESS }}
            </div>
          </div>
          <div class="rounded border p-3">
            <div class="text-xs text-gray-500">待验证</div>
            <div class="text-xl font-semibold text-purple-500">
              {{ issuesByStatus.RESOLVED }}
            </div>
          </div>
          <div class="rounded border p-3">
            <div class="text-xs text-gray-500">已关闭</div>
            <div class="text-xl font-semibold text-green-500">
              {{ issuesByStatus.CLOSED }}
            </div>
          </div>
        </div>
      </Card>

      <Tabs>
        <Tabs.TabPane key="issue" tab="问题台账">
          <Card>
            <div class="mb-3 flex items-center justify-between">
              <Space>
                <Button type="primary" @click="openCreateIssue">
                  新建问题
                </Button>
                <Button @click="loadIssues">刷新</Button>
              </Space>
              <div class="text-xs text-gray-500">
                选中问题将关联到日报：{{ selectedIssueIds.length }} 条
              </div>
            </div>
            <Table
              row-key="id"
              :data-source="issues"
              :loading="loadingIssues"
              :row-selection="{
                selectedRowKeys: selectedIssueIds,
                onChange: onIssueSelectionChange,
              }"
              :pagination="{ pageSize: 10 }"
            >
              <Table.Column title="日期" data-index="date" width="110" />
              <Table.Column
                title="项目名称"
                data-index="projectName"
                width="150"
              />
              <Table.Column
                title="工单号"
                data-index="workOrderNumber"
                width="130"
              />
              <Table.Column title="问题描述" data-index="description" />
              <Table.Column
                title="责任部门"
                data-index="responsibleDepartment"
                width="110"
              />
              <Table.Column title="状态" data-index="status" width="100">
                <template #default="{ record }">
                  <Tag
                    :color="
                      record.status === 'CLOSED'
                        ? 'green'
                        : record.status === 'IN_PROGRESS'
                          ? 'blue'
                          : record.status === 'RESOLVED'
                            ? 'purple'
                            : 'orange'
                    "
                  >
                    {{
                      record.status === 'CLOSED'
                        ? '已关闭'
                        : record.status === 'IN_PROGRESS'
                          ? '处理中'
                          : record.status === 'RESOLVED'
                            ? '待验证'
                            : '待处理'
                    }}
                  </Tag>
                </template>
              </Table.Column>
              <Table.Column title="操作" width="170" fixed="right">
                <template #default="{ record }">
                  <Space>
                    <Button
                      size="small"
                      type="link"
                      @click="openEditIssue(record)"
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      type="link"
                      @click="viewIssueLogs(record)"
                    >
                      日志
                    </Button>
                    <Button
                      v-if="record.status !== 'CLOSED'"
                      size="small"
                      type="link"
                      @click="quickCloseIssue(record)"
                    >
                      关闭
                    </Button>
                  </Space>
                </template>
              </Table.Column>
            </Table>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="report" tab="日报生成与发布">
          <Card title="生成试验日报">
            <Form layout="vertical">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Form.Item label="关联工单">
                  <WorkOrderSelect
                    v-model:value="selectedReportWorkOrderValue"
                    @change="onReportWorkOrderChange"
                  />
                </Form.Item>
                <Form.Item label="项目名称" required>
                  <Input
                    v-model:value="reportForm.projectName"
                    placeholder="例如：75T抱罐车"
                  />
                </Form.Item>
                <Form.Item label="日期" required>
                  <DatePicker
                    v-model:value="reportForm.date"
                    value-format="YYYY-MM-DD"
                    class="w-full"
                  />
                </Form.Item>
              </div>
              <Form.Item label="汇报人（空格或逗号分隔）" required>
                <Input
                  v-model:value="reportForm.reportersText"
                  placeholder="例如：邓志良 张达"
                />
              </Form.Item>
              <Form.Item label="主要工作（每行一条）" required>
                <Input.TextArea
                  v-model:value="reportForm.mainWorksText"
                  :rows="6"
                  placeholder="1、大臂检验符合要求..."
                />
              </Form.Item>
              <Form.Item label="备注">
                <Input.TextArea
                  v-model:value="reportForm.notes"
                  :rows="3"
                  placeholder="可填写客户要求、注意事项等"
                />
              </Form.Item>
              <Space>
                <Button type="primary" @click="createReport"
                  >生成并发布日报</Button
                >
                <Button @click="loadReports">刷新日报列表</Button>
              </Space>
            </Form>
          </Card>

          <Card title="历史日报" class="mt-4">
            <Table
              row-key="id"
              :data-source="reports"
              :loading="loadingReports"
              :pagination="{ pageSize: 8 }"
            >
              <Table.Column title="日期" data-index="date" width="110" />
              <Table.Column
                title="项目名称"
                data-index="projectName"
                width="160"
              />
              <Table.Column title="汇报人" width="180">
                <template #default="{ record }">
                  {{ (record.reporters || []).join(' ') || '-' }}
                </template>
              </Table.Column>
              <Table.Column title="关联问题数" width="100">
                <template #default="{ record }">
                  {{ (record.issueIds || []).length }}
                </template>
              </Table.Column>
              <Table.Column title="操作" width="120">
                <template #default="{ record }">
                  <Space>
                    <Button
                      size="small"
                      type="link"
                      @click="previewReportText(record)"
                    >
                      预览
                    </Button>
                    <Button
                      size="small"
                      type="link"
                      @click="exportReportAsWord(record)"
                    >
                      Word
                    </Button>
                    <Button
                      size="small"
                      type="link"
                      @click="exportReportAsPdf(record)"
                    >
                      PDF
                    </Button>
                  </Space>
                </template>
              </Table.Column>
            </Table>
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>

    <Modal
      v-model:open="issueModalOpen"
      :title="issueEditId ? '编辑调试问题' : '新建调试问题'"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitIssue"
    >
      <Form layout="vertical">
        <Form.Item label="日期">
          <DatePicker
            v-model:value="issueForm.date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </Form.Item>
        <Form.Item label="项目名称" required>
          <Input v-model:value="issueForm.projectName" />
        </Form.Item>
        <Form.Item label="工单号">
          <WorkOrderSelect
            v-model:value="selectedWorkOrderValue"
            @change="onWorkOrderChange"
          />
        </Form.Item>
        <Form.Item label="部件名称">
          <Input v-model:value="issueForm.partName" />
        </Form.Item>
        <Form.Item label="问题描述" required>
          <Input.TextArea v-model:value="issueForm.description" :rows="4" />
        </Form.Item>
        <Form.Item label="责任部门">
          <Input v-model:value="issueForm.responsibleDepartment" />
        </Form.Item>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Form.Item label="严重程度">
            <Select
              v-model:value="issueForm.severity"
              :options="severityOptions"
            />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              v-model:value="issueForm.status"
              :options="issueStatusOptions"
            />
          </Form.Item>
        </div>
        <Form.Item label="处理建议">
          <Input.TextArea v-model:value="issueForm.solution" :rows="3" />
        </Form.Item>
        <Form.Item label="责任人">
          <Input v-model:value="issueForm.assignee" />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="issueLogModalOpen"
      title="问题处理记录"
      :footer="null"
      width="760"
    >
      <Table
        row-key="id"
        :data-source="issueLogs"
        :pagination="false"
        size="small"
      >
        <Table.Column title="时间" data-index="createdAt" width="180" />
        <Table.Column title="操作人" data-index="operator" width="120" />
        <Table.Column title="动作" data-index="action" width="100" />
        <Table.Column title="内容" data-index="details" />
      </Table>
    </Modal>

    <Modal
      v-model:open="reportPreviewModalOpen"
      :title="reportPreviewTitle"
      :footer="null"
      width="920"
    >
      <pre class="max-h-[560px] overflow-auto whitespace-pre-wrap"
        >{{ reportPreviewText }}
      </pre>
    </Modal>
  </Page>
</template>
