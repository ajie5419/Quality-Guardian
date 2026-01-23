/* eslint-disable no-console */
import process from 'node:process';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 开始完整权限系统初始化...');

  // 1. 清理旧菜单结构
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `menus`;');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');

  // 2. 全量菜单定义 - 每个页面都包含完整的按钮权限
  const menuData = [
    // ===================== 系统管理 =====================
    {
      id: 10,
      parentId: 0,
      path: '/system',
      name: 'System',
      component: 'BasicLayout',
      redirect: '/system/user',
      type: 'catalog',
      meta: { title: '系统管理', icon: 'carbon:settings', order: 2000 },
    },

    // --- 用户管理 ---
    {
      id: 11,
      parentId: 10,
      path: '/system/user',
      name: 'SystemUser',
      component: '/system/user/index',
      type: 'menu',
      authCode: 'System:User:List',
      meta: { title: '用户管理', icon: 'carbon:user' },
    },
    { id: 1100, parentId: 11, name: 'SystemUserView', type: 'button', authCode: 'System:User:View', meta: { title: '查看' } },
    { id: 1101, parentId: 11, name: 'SystemUserCreate', type: 'button', authCode: 'System:User:Create', meta: { title: '新增' } },
    { id: 1102, parentId: 11, name: 'SystemUserEdit', type: 'button', authCode: 'System:User:Edit', meta: { title: '编辑' } },
    { id: 1103, parentId: 11, name: 'SystemUserDelete', type: 'button', authCode: 'System:User:Delete', meta: { title: '删除' } },
    { id: 1104, parentId: 11, name: 'SystemUserExport', type: 'button', authCode: 'System:User:Export', meta: { title: '导出' } },
    { id: 1105, parentId: 11, name: 'SystemUserImport', type: 'button', authCode: 'System:User:Import', meta: { title: '导入' } },

    // --- 角色管理 ---
    {
      id: 12,
      parentId: 10,
      path: '/system/role',
      name: 'SystemRole',
      component: '/system/role/index',
      type: 'menu',
      authCode: 'System:Role:List',
      meta: { title: '角色管理', icon: 'carbon:user-role' },
    },
    { id: 1200, parentId: 12, name: 'SystemRoleView', type: 'button', authCode: 'System:Role:View', meta: { title: '查看' } },
    { id: 1201, parentId: 12, name: 'SystemRoleCreate', type: 'button', authCode: 'System:Role:Create', meta: { title: '新增' } },
    { id: 1202, parentId: 12, name: 'SystemRoleEdit', type: 'button', authCode: 'System:Role:Edit', meta: { title: '编辑' } },
    { id: 1203, parentId: 12, name: 'SystemRoleDelete', type: 'button', authCode: 'System:Role:Delete', meta: { title: '删除' } },
    { id: 1204, parentId: 12, name: 'SystemRolePermission', type: 'button', authCode: 'System:Role:Permission', meta: { title: '权限配置' } },

    // --- 菜单管理 ---
    {
      id: 13,
      parentId: 10,
      path: '/system/menu',
      name: 'SystemMenu',
      component: '/system/menu/index',
      type: 'menu',
      authCode: 'System:Menu:List',
      meta: { title: '菜单管理', icon: 'carbon:menu' },
    },
    { id: 1300, parentId: 13, name: 'SystemMenuView', type: 'button', authCode: 'System:Menu:View', meta: { title: '查看' } },
    { id: 1301, parentId: 13, name: 'SystemMenuCreate', type: 'button', authCode: 'System:Menu:Create', meta: { title: '新增' } },
    { id: 1302, parentId: 13, name: 'SystemMenuEdit', type: 'button', authCode: 'System:Menu:Edit', meta: { title: '编辑' } },
    { id: 1303, parentId: 13, name: 'SystemMenuDelete', type: 'button', authCode: 'System:Menu:Delete', meta: { title: '删除' } },

    // --- 部门管理 ---
    {
      id: 14,
      parentId: 10,
      path: '/system/dept',
      name: 'SystemDept',
      component: '/system/dept/index',
      type: 'menu',
      authCode: 'System:Dept:List',
      meta: { title: '部门管理', icon: 'carbon:container-services' },
    },
    { id: 1400, parentId: 14, name: 'SystemDeptView', type: 'button', authCode: 'System:Dept:View', meta: { title: '查看' } },
    { id: 1401, parentId: 14, name: 'SystemDeptCreate', type: 'button', authCode: 'System:Dept:Create', meta: { title: '新增' } },
    { id: 1402, parentId: 14, name: 'SystemDeptEdit', type: 'button', authCode: 'System:Dept:Edit', meta: { title: '编辑' } },
    { id: 1403, parentId: 14, name: 'SystemDeptDelete', type: 'button', authCode: 'System:Dept:Delete', meta: { title: '删除' } },

    // --- AI 设置 ---
    {
      id: 15,
      parentId: 10,
      path: '/system/ai-settings',
      name: 'SystemAiSettings',
      component: '/system/ai-settings/index',
      type: 'menu',
      authCode: 'System:AiSettings:List',
      meta: { title: 'AI 设置', icon: 'carbon:ai' },
    },
    { id: 1500, parentId: 15, name: 'SystemAiSettingsView', type: 'button', authCode: 'System:AiSettings:View', meta: { title: '查看' } },
    { id: 1501, parentId: 15, name: 'SystemAiSettingsEdit', type: 'button', authCode: 'System:AiSettings:Edit', meta: { title: '修改配置' } },

    // ===================== QMS 质量管理 =====================
    {
      id: 20,
      parentId: 0,
      path: '/qms',
      name: 'QMS',
      component: 'BasicLayout',
      redirect: '/qms/dashboard',
      type: 'catalog',
      meta: { title: '质量管理', icon: 'carbon:cloud-service-management', order: 1 },
    },

    // --- 质量概览 ---
    {
      id: 21,
      parentId: 20,
      path: '/qms/dashboard',
      name: 'QMSDashboard',
      component: '/qms/dashboard/index',
      type: 'menu',
      authCode: 'QMS:Dashboard:List',
      meta: { title: '质量概览', icon: 'carbon:meter' },
    },
    { id: 2100, parentId: 21, name: 'QMSDashboardView', type: 'button', authCode: 'QMS:Dashboard:View', meta: { title: '查看' } },
    { id: 2101, parentId: 21, name: 'QMSDashboardChartAdd', type: 'button', authCode: 'QMS:Dashboard:ChartAdd', meta: { title: '新增图表' } },
    { id: 2102, parentId: 21, name: 'QMSDashboardChartEdit', type: 'button', authCode: 'QMS:Dashboard:ChartEdit', meta: { title: '编辑图表' } },
    { id: 2103, parentId: 21, name: 'QMSDashboardChartDelete', type: 'button', authCode: 'QMS:Dashboard:ChartDelete', meta: { title: '删除图表' } },

    // --- 工作台 ---
    {
      id: 22,
      parentId: 20,
      path: '/qms/workspace',
      name: 'QMSWorkspace',
      component: '/qms/workspace/index',
      type: 'menu',
      authCode: 'QMS:Workspace:List',
      meta: { title: '工作台', icon: 'carbon:workspace' },
    },
    { id: 2200, parentId: 22, name: 'QMSWorkspaceView', type: 'button', authCode: 'QMS:Workspace:View', meta: { title: '查看' } },

    // ===================== 质量策划 =====================
    {
      id: 30,
      parentId: 20,
      path: '/qms/planning',
      name: 'QMSPlanning',
      type: 'catalog',
      meta: { title: '质量策划', icon: 'carbon:event-schedule' },
    },

    // --- BOM 管理 ---
    {
      id: 31,
      parentId: 30,
      path: '/qms/planning/bom',
      name: 'QMSPlanningBOM',
      component: '/qms/planning/bom/index',
      type: 'menu',
      authCode: 'QMS:Planning:BOM:List',
      meta: { title: 'BOM管理', icon: 'carbon:tree-view-alt' },
    },
    { id: 3100, parentId: 31, name: 'QMSPlanningBOMView', type: 'button', authCode: 'QMS:Planning:BOM:View', meta: { title: '查看' } },
    { id: 3101, parentId: 31, name: 'QMSPlanningBOMCreate', type: 'button', authCode: 'QMS:Planning:BOM:Create', meta: { title: '新增' } },
    { id: 3102, parentId: 31, name: 'QMSPlanningBOMEdit', type: 'button', authCode: 'QMS:Planning:BOM:Edit', meta: { title: '编辑' } },
    { id: 3103, parentId: 31, name: 'QMSPlanningBOMDelete', type: 'button', authCode: 'QMS:Planning:BOM:Delete', meta: { title: '删除' } },
    { id: 3104, parentId: 31, name: 'QMSPlanningBOMExport', type: 'button', authCode: 'QMS:Planning:BOM:Export', meta: { title: '导出' } },
    { id: 3105, parentId: 31, name: 'QMSPlanningBOMImport', type: 'button', authCode: 'QMS:Planning:BOM:Import', meta: { title: '导入' } },

    // --- DFMEA ---
    {
      id: 32,
      parentId: 30,
      path: '/qms/planning/dfmea',
      name: 'QMSPlanningDFMEA',
      component: '/qms/planning/dfmea/index',
      type: 'menu',
      authCode: 'QMS:Planning:DFMEA:List',
      meta: { title: 'DFMEA', icon: 'carbon:flow-modeler' },
    },
    { id: 3200, parentId: 32, name: 'QMSPlanningDFMEAView', type: 'button', authCode: 'QMS:Planning:DFMEA:View', meta: { title: '查看' } },
    { id: 3201, parentId: 32, name: 'QMSPlanningDFMEACreate', type: 'button', authCode: 'QMS:Planning:DFMEA:Create', meta: { title: '新增' } },
    { id: 3202, parentId: 32, name: 'QMSPlanningDFMEAEdit', type: 'button', authCode: 'QMS:Planning:DFMEA:Edit', meta: { title: '编辑' } },
    { id: 3203, parentId: 32, name: 'QMSPlanningDFMEADelete', type: 'button', authCode: 'QMS:Planning:DFMEA:Delete', meta: { title: '删除' } },
    { id: 3204, parentId: 32, name: 'QMSPlanningDFMEAExport', type: 'button', authCode: 'QMS:Planning:DFMEA:Export', meta: { title: '导出' } },

    // --- ITP 检验计划 ---
    {
      id: 33,
      parentId: 30,
      path: '/qms/planning/itp',
      name: 'QMSPlanningITP',
      component: '/qms/planning/itp/index',
      type: 'menu',
      authCode: 'QMS:Planning:ITP:List',
      meta: { title: 'ITP 检验计划', icon: 'carbon:list-checked' },
    },
    { id: 3300, parentId: 33, name: 'QMSPlanningITPView', type: 'button', authCode: 'QMS:Planning:ITP:View', meta: { title: '查看' } },
    { id: 3301, parentId: 33, name: 'QMSPlanningITPCreate', type: 'button', authCode: 'QMS:Planning:ITP:Create', meta: { title: '新增' } },
    { id: 3302, parentId: 33, name: 'QMSPlanningITPEdit', type: 'button', authCode: 'QMS:Planning:ITP:Edit', meta: { title: '编辑' } },
    { id: 3303, parentId: 33, name: 'QMSPlanningITPDelete', type: 'button', authCode: 'QMS:Planning:ITP:Delete', meta: { title: '删除' } },
    { id: 3304, parentId: 33, name: 'QMSPlanningITPExport', type: 'button', authCode: 'QMS:Planning:ITP:Export', meta: { title: '导出' } },
    { id: 3305, parentId: 33, name: 'QMSPlanningITPDispatch', type: 'button', authCode: 'QMS:Planning:ITP:Dispatch', meta: { title: '下发' } },

    // --- 项目资料 ---
    {
      id: 34,
      parentId: 30,
      path: '/qms/planning/docs',
      name: 'QMSProjectDocs',
      component: '/qms/planning/project-docs/index',
      type: 'menu',
      authCode: 'QMS:Planning:ProjectDocs:List',
      meta: { title: '项目资料', icon: 'carbon:document' },
    },
    { id: 3400, parentId: 34, name: 'QMSProjectDocsView', type: 'button', authCode: 'QMS:Planning:ProjectDocs:View', meta: { title: '查看' } },
    { id: 3401, parentId: 34, name: 'QMSProjectDocsCreate', type: 'button', authCode: 'QMS:Planning:ProjectDocs:Create', meta: { title: '上传' } },
    { id: 3402, parentId: 34, name: 'QMSProjectDocsEdit', type: 'button', authCode: 'QMS:Planning:ProjectDocs:Edit', meta: { title: '编辑' } },
    { id: 3403, parentId: 34, name: 'QMSProjectDocsDelete', type: 'button', authCode: 'QMS:Planning:ProjectDocs:Delete', meta: { title: '删除' } },
    { id: 3404, parentId: 34, name: 'QMSProjectDocsDownload', type: 'button', authCode: 'QMS:Planning:ProjectDocs:Download', meta: { title: '下载' } },

    // ===================== 检验管理 =====================
    {
      id: 40,
      parentId: 20,
      path: '/qms/inspection',
      name: 'QMSInspection',
      type: 'catalog',
      meta: { title: '检验管理', icon: 'carbon:task' },
    },

    // --- 检验记录 ---
    {
      id: 41,
      parentId: 40,
      path: '/qms/inspection/records',
      name: 'QMSInspectionRecords',
      component: '/qms/inspection/records/index',
      type: 'menu',
      authCode: 'QMS:Inspection:Records:List',
      meta: { title: '检验记录', icon: 'carbon:catalog' },
    },
    { id: 4100, parentId: 41, name: 'QMSInspectionRecordsView', type: 'button', authCode: 'QMS:Inspection:Records:View', meta: { title: '查看' } },
    { id: 4101, parentId: 41, name: 'QMSInspectionRecordsCreate', type: 'button', authCode: 'QMS:Inspection:Records:Create', meta: { title: '新增' } },
    { id: 4102, parentId: 41, name: 'QMSInspectionRecordsEdit', type: 'button', authCode: 'QMS:Inspection:Records:Edit', meta: { title: '编辑' } },
    { id: 4103, parentId: 41, name: 'QMSInspectionRecordsDelete', type: 'button', authCode: 'QMS:Inspection:Records:Delete', meta: { title: '删除' } },
    { id: 4104, parentId: 41, name: 'QMSInspectionRecordsExport', type: 'button', authCode: 'QMS:Inspection:Records:Export', meta: { title: '导出' } },
    { id: 4105, parentId: 41, name: 'QMSInspectionRecordsImport', type: 'button', authCode: 'QMS:Inspection:Records:Import', meta: { title: '导入' } },

    // --- 不合格品项 ---
    {
      id: 42,
      parentId: 40,
      path: '/qms/inspection/issues',
      name: 'QMSInspectionIssues',
      component: '/qms/inspection/issues/index',
      type: 'menu',
      authCode: 'QMS:Inspection:Issues:List',
      meta: { title: '不合格品项', icon: 'carbon:warning-alt' },
    },
    { id: 4200, parentId: 42, name: 'QMSInspectionIssuesView', type: 'button', authCode: 'QMS:Inspection:Issues:View', meta: { title: '查看' } },
    { id: 4201, parentId: 42, name: 'QMSInspectionIssuesCreate', type: 'button', authCode: 'QMS:Inspection:Issues:Create', meta: { title: '新增' } },
    { id: 4202, parentId: 42, name: 'QMSInspectionIssuesEdit', type: 'button', authCode: 'QMS:Inspection:Issues:Edit', meta: { title: '编辑' } },
    { id: 4203, parentId: 42, name: 'QMSInspectionIssuesDelete', type: 'button', authCode: 'QMS:Inspection:Issues:Delete', meta: { title: '删除' } },
    { id: 4204, parentId: 42, name: 'QMSInspectionIssuesSettle', type: 'button', authCode: 'QMS:Inspection:Issues:Settle', meta: { title: '案例沉淀' } },
    { id: 4205, parentId: 42, name: 'QMSInspectionIssuesChartAdd', type: 'button', authCode: 'QMS:Inspection:Issues:ChartAdd', meta: { title: '新增图表' } },
    { id: 4206, parentId: 42, name: 'QMSInspectionIssuesChartEdit', type: 'button', authCode: 'QMS:Inspection:Issues:ChartEdit', meta: { title: '编辑图表' } },
    { id: 4207, parentId: 42, name: 'QMSInspectionIssuesChartDelete', type: 'button', authCode: 'QMS:Inspection:Issues:ChartDelete', meta: { title: '删除图表' } },

    // ===================== 业务管理 =====================

    // --- 售后质量 ---
    {
      id: 50,
      parentId: 20,
      path: '/qms/after-sales',
      name: 'QMSAfterSales',
      component: '/qms/after-sales/index',
      type: 'menu',
      authCode: 'QMS:AfterSales:List',
      meta: { title: '售后质量', icon: 'carbon:customer-service' },
    },
    { id: 5000, parentId: 50, name: 'QMSAfterSalesView', type: 'button', authCode: 'QMS:AfterSales:View', meta: { title: '查看' } },
    { id: 5001, parentId: 50, name: 'QMSAfterSalesCreate', type: 'button', authCode: 'QMS:AfterSales:Create', meta: { title: '新增' } },
    { id: 5002, parentId: 50, name: 'QMSAfterSalesEdit', type: 'button', authCode: 'QMS:AfterSales:Edit', meta: { title: '编辑' } },
    { id: 5003, parentId: 50, name: 'QMSAfterSalesDelete', type: 'button', authCode: 'QMS:AfterSales:Delete', meta: { title: '删除' } },
    { id: 5004, parentId: 50, name: 'QMSAfterSalesChartAdd', type: 'button', authCode: 'QMS:AfterSales:ChartAdd', meta: { title: '新增图表' } },
    { id: 5005, parentId: 50, name: 'QMSAfterSalesChartEdit', type: 'button', authCode: 'QMS:AfterSales:ChartEdit', meta: { title: '编辑图表' } },
    { id: 5006, parentId: 50, name: 'QMSAfterSalesChartDelete', type: 'button', authCode: 'QMS:AfterSales:ChartDelete', meta: { title: '删除图表' } },
    { id: 5007, parentId: 50, name: 'QMSAfterSalesSettle', type: 'button', authCode: 'QMS:AfterSales:Settle', meta: { title: '案例沉淀' } },

    // --- 供应商管理 ---
    {
      id: 51,
      parentId: 20,
      path: '/qms/supplier',
      name: 'QMSSupplier',
      component: '/qms/supplier/index',
      type: 'menu',
      authCode: 'QMS:Supplier:List',
      meta: { title: '供应商管理', icon: 'carbon:delivery-truck' },
    },
    { id: 5100, parentId: 51, name: 'QMSSupplierView', type: 'button', authCode: 'QMS:Supplier:View', meta: { title: '查看' } },
    { id: 5101, parentId: 51, name: 'QMSSupplierCreate', type: 'button', authCode: 'QMS:Supplier:Create', meta: { title: '新增' } },
    { id: 5102, parentId: 51, name: 'QMSSupplierEdit', type: 'button', authCode: 'QMS:Supplier:Edit', meta: { title: '编辑' } },
    { id: 5103, parentId: 51, name: 'QMSSupplierDelete', type: 'button', authCode: 'QMS:Supplier:Delete', meta: { title: '删除' } },
    { id: 5104, parentId: 51, name: 'QMSSupplierExport', type: 'button', authCode: 'QMS:Supplier:Export', meta: { title: '导出' } },
    { id: 5105, parentId: 51, name: 'QMSSupplierImport', type: 'button', authCode: 'QMS:Supplier:Import', meta: { title: '导入' } },

    // --- 外协管理 ---
    {
      id: 52,
      parentId: 20,
      path: '/qms/outsourcing',
      name: 'QMSOutsourcing',
      component: '/qms/outsourcing/index',
      type: 'menu',
      authCode: 'QMS:Outsourcing:List',
      meta: { title: '外协管理', icon: 'carbon:enterprise' },
    },
    { id: 5200, parentId: 52, name: 'QMSOutsourcingView', type: 'button', authCode: 'QMS:Outsourcing:View', meta: { title: '查看' } },
    { id: 5201, parentId: 52, name: 'QMSOutsourcingCreate', type: 'button', authCode: 'QMS:Outsourcing:Create', meta: { title: '新增' } },
    { id: 5202, parentId: 52, name: 'QMSOutsourcingEdit', type: 'button', authCode: 'QMS:Outsourcing:Edit', meta: { title: '编辑' } },
    { id: 5203, parentId: 52, name: 'QMSOutsourcingDelete', type: 'button', authCode: 'QMS:Outsourcing:Delete', meta: { title: '删除' } },

    // --- 质量知识库 ---
    {
      id: 53,
      parentId: 20,
      path: '/qms/knowledge',
      name: 'QMSKnowledge',
      component: '/qms/knowledge/index',
      type: 'menu',
      authCode: 'QMS:Knowledge:List',
      meta: { title: '质量知识库', icon: 'carbon:education' },
    },
    { id: 5300, parentId: 53, name: 'QMSKnowledgeView', type: 'button', authCode: 'QMS:Knowledge:View', meta: { title: '查看' } },
    { id: 5301, parentId: 53, name: 'QMSKnowledgeCreate', type: 'button', authCode: 'QMS:Knowledge:Create', meta: { title: '新增' } },
    { id: 5302, parentId: 53, name: 'QMSKnowledgeEdit', type: 'button', authCode: 'QMS:Knowledge:Edit', meta: { title: '编辑' } },
    { id: 5303, parentId: 53, name: 'QMSKnowledgeDelete', type: 'button', authCode: 'QMS:Knowledge:Delete', meta: { title: '删除' } },

    // ===================== 报表分析 =====================
    {
      id: 60,
      parentId: 20,
      path: '/qms/analysis',
      name: 'QMSAnalysis',
      type: 'catalog',
      meta: { title: '报表分析', icon: 'carbon:analytics' },
    },

    // --- 质量损失 ---
    {
      id: 61,
      parentId: 60,
      path: '/qms/analysis/loss',
      name: 'QMSLossAnalysis',
      component: '/qms/quality-loss/index',
      type: 'menu',
      authCode: 'QMS:LossAnalysis:List',
      meta: { title: '质量损失', icon: 'carbon:chart-venn-diagram' },
    },
    { id: 6100, parentId: 61, name: 'QMSLossAnalysisView', type: 'button', authCode: 'QMS:LossAnalysis:View', meta: { title: '查看' } },
    { id: 6101, parentId: 61, name: 'QMSLossAnalysisCreate', type: 'button', authCode: 'QMS:LossAnalysis:Create', meta: { title: '新增' } },
    { id: 6102, parentId: 61, name: 'QMSLossAnalysisEdit', type: 'button', authCode: 'QMS:LossAnalysis:Edit', meta: { title: '编辑' } },
    { id: 6103, parentId: 61, name: 'QMSLossAnalysisDelete', type: 'button', authCode: 'QMS:LossAnalysis:Delete', meta: { title: '删除' } },
    { id: 6104, parentId: 61, name: 'QMSLossAnalysisExport', type: 'button', authCode: 'QMS:LossAnalysis:Export', meta: { title: '导出' } },
    { id: 6105, parentId: 61, name: 'QMSLossAnalysisImport', type: 'button', authCode: 'QMS:LossAnalysis:Import', meta: { title: '导入' } },

    // --- 日报查看 ---
    {
      id: 62,
      parentId: 60,
      path: '/qms/analysis/daily',
      name: 'QMSDailyReports',
      component: '/qms/reports/index',
      type: 'menu',
      authCode: 'QMS:Reports:Daily:List',
      meta: { title: '日报查看', icon: 'carbon:report' },
    },
    { id: 6200, parentId: 62, name: 'QMSDailyReportsView', type: 'button', authCode: 'QMS:Reports:Daily:View', meta: { title: '查看' } },
    { id: 6201, parentId: 62, name: 'QMSDailyReportsExport', type: 'button', authCode: 'QMS:Reports:Daily:Export', meta: { title: '导出' } },

    // --- 周月报查看 ---
    {
      id: 63,
      parentId: 60,
      path: '/qms/analysis/summary',
      name: 'QMSReportSummary',
      component: '/qms/reports/summary/index',
      type: 'menu',
      authCode: 'QMS:Reports:Summary:List',
      meta: { title: '周月报查看', icon: 'carbon:calendar-settings' },
    },
    { id: 6300, parentId: 63, name: 'QMSReportSummaryView', type: 'button', authCode: 'QMS:Reports:Summary:View', meta: { title: '查看' } },
    { id: 6301, parentId: 63, name: 'QMSReportSummaryExport', type: 'button', authCode: 'QMS:Reports:Summary:Export', meta: { title: '导出' } },
  ];

  // 3. 收集所有权限码
  const allAuthCodes = menuData
    .filter((m) => m.authCode)
    .map((m) => m.authCode);

  console.log(`📋 共定义 ${menuData.length} 个菜单/按钮，${allAuthCodes.length} 个权限码`);

  // 4. 更新超级管理员权限
  await prisma.roles.upsert({
    where: { id: '1' },
    update: {
      name: 'super',
      permissions: JSON.stringify(allAuthCodes),
    },
    create: {
      id: '1',
      name: 'super',
      description: '超级管理员',
      permissions: JSON.stringify(allAuthCodes),
      status: 1,
    },
  });

  // 5. 更新普通用户权限 (可选，为了方便测试)
  await prisma.roles.upsert({
    where: { id: 'user-role' },
    update: {},
    create: {
      id: 'user-role',
      name: 'user',
      description: '普通用户',
      permissions: JSON.stringify([
        'QMS:AfterSales:List',
        'QMS:AfterSales:View',
        'QMS:AfterSales:Settle',
        'QMS:Inspection:Issues:List',
        'QMS:Inspection:Issues:View',
        'QMS:Inspection:Issues:Settle',
      ]),
      status: 1,
    },
  });

  // 6. 用户同步
  const hashedPassword = await bcrypt.hash('123456', 12);
  await prisma.users.upsert({
    where: { username: 'vben' },
    update: { roleId: '1', status: 'ACTIVE' },
    create: {
      id: '1',
      username: 'vben',
      realName: '超级管理员',
      password: hashedPassword,
      roleId: '1',
      department: '1',
      status: 'ACTIVE',
    },
  });

  // 6. 执行菜单入库
  for (const item of menuData) {
    await prisma.menus.create({
      data: {
        id: item.id,
        parentId: item.parentId,
        path: item.path || null,
        name: item.name,
        component: item.component || null,
        redirect: item.redirect || null,
        type: item.type,
        meta: JSON.stringify(item.meta),
        authCode: item.authCode || null,
        status: 1,
        order: item.meta.order || 0,
      },
    });
  }

  console.log('✅ 权限系统初始化完成！所有页面和按钮权限已就绪。');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
