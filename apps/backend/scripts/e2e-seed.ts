import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import { PrismaClient } from '@prisma/client';
import {
  INSPECTION_ISSUE_PERMISSION_CODES,
  INSPECTION_MATERIAL_PERMISSION_CODES,
  INSPECTION_RECORD_PERMISSION_CODES,
  INSPECTION_REQUEST_PERMISSION_CODES,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import bcrypt from 'bcrypt';

import { assertOwnedTargets } from '../../../scripts/e2e/safety.mjs';

/** Seed only prerequisites, never the inspection request under test. */
async function seed() {
  await assertOwnedTargets(process.env);
  const password = process.env.QGS_E2E_PASSWORD;
  const username = process.env.QGS_E2E_USERNAME;
  if (!password || !username) throw new Error('Missing ephemeral login');
  const prisma = new PrismaClient();
  try {
    if (
      (await prisma.users.count()) ||
      (await prisma.qms_inspection_requests.count())
    ) {
      throw new Error('Seed requires a fresh owned database');
    }
    const departmentId = createId();
    const roleId = createId();
    const userId = createId();
    const processId = createId();
    const incomingProcessId = createId();
    const partId = createId();
    const customerId = createId();
    const otherDepartmentId = createId();
    const supplierId = createId();
    const outsourcingId = createId();
    const defectCategoryId = createId();
    const defectSubcategoryId = createId();
    const qcId = createId();
    const otherQcId = createId();
    const foreignId = createId();
    const readerId = createId();
    const purchasingDepartmentId = createId();
    const afterSalesProductCategoryId = createId();
    const afterSalesProductSubcategoryId = createId();
    const afterSalesDefectCategoryId = createId();
    const afterSalesDefectSubcategoryId = createId();
    const metrologyBorrowerNameId = createId();
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.dictionaries.create({
        data: {
          id: metrologyBorrowerNameId,
          dictType: 'borrower_name',
          dictKey: 'E2E Reporter',
          dictValue: 'E2E Reporter',
          status: 1,
        },
      });
      await tx.departments.create({
        data: { id: departmentId, name: 'E2E Production' },
      });
      await tx.roles.create({ data: { id: roleId, name: 'e2e-dispatch' } });
      await tx.users.create({
        data: {
          id: userId,
          username,
          password: passwordHash,
          realName: 'E2E Reporter',
          roleId,
          department: departmentId,
          status: 'ACTIVE',
        },
      });
      await tx.rbac_user_roles.create({
        data: { id: createId(), userId, roleId },
      });
      for (const code of [
        INSPECTION_REQUEST_PERMISSION_CODES.CREATE,
        // Pending-list visibility and inspector options require dispatch rights.
        INSPECTION_REQUEST_PERMISSION_CODES.DISPATCH,
        'QMS:Inspection:Requests:List',
        INSPECTION_MATERIAL_PERMISSION_CODES.LIST,
        INSPECTION_MATERIAL_PERMISSION_CODES.APPROVE,
        INSPECTION_MATERIAL_PERMISSION_CODES.REJECT,
        INSPECTION_RECORD_PERMISSION_CODES.LIST,
        INSPECTION_RECORD_PERMISSION_CODES.CREATE,
        // Records export/denial coverage needs the primary actor to reach the
        // export endpoint so a scoped result (not a 403) can be asserted.
        INSPECTION_RECORD_PERMISSION_CODES.EXPORT,
        'System:InspectionSettings:Edit',
      ]) {
        const permissionId = createId();
        await tx.rbac_permissions.create({
          data: { id: permissionId, code, name: code, module: 'inspection' },
        });
        await tx.rbac_role_permissions.create({
          data: { id: createId(), roleId, permissionId },
        });
      }
      await tx.data_permission_policies.create({
        data: {
          id: createId(),
          roleId,
          module: 'inspection',
          scopeType: 'ALL',
        },
      });
      // The manual-record selector reads the authenticated work-order catalog.
      await tx.data_permission_policies.create({
        data: {
          id: createId(),
          roleId,
          module: 'work-order',
          scopeType: 'ALL',
        },
      });
      // The manual incoming form selector reads active suppliers.
      await tx.data_permission_policies.create({
        data: {
          id: createId(),
          roleId,
          module: 'supplier',
          scopeType: 'ALL',
        },
      });
      await tx.departments.create({
        data: { id: otherDepartmentId, name: 'E2E Other Department' },
      });
      // Only prerequisite settings use an admin; tested business actors retain RBAC.
      const settingsRoleId = createId();
      const settingsUserId = createId();
      await tx.roles.create({ data: { id: settingsRoleId, name: 'admin' } });
      await tx.users.create({
        data: {
          id: settingsUserId,
          username: `${username}_settings`,
          realName: 'E2E Settings',
          password: passwordHash,
          roleId: settingsRoleId,
          department: departmentId,
          status: 'ACTIVE',
        },
      });
      await tx.rbac_user_roles.create({
        data: {
          id: createId(),
          userId: settingsUserId,
          roleId: settingsRoleId,
        },
      });
      const editSettingPerm = await tx.rbac_permissions.upsert({
        where: { code: 'System:InspectionSettings:Edit' },
        create: {
          id: createId(),
          code: 'System:InspectionSettings:Edit',
          name: 'System:InspectionSettings:Edit',
          module: 'inspection',
        },
        update: {},
      });
      await tx.rbac_role_permissions.create({
        data: {
          id: createId(),
          roleId: settingsRoleId,
          permissionId: editSettingPerm.id,
        },
      });
      const list = 'QMS:Inspection:Requests:List';
      const qcRoleId = createId();
      const foreignRoleId = createId();
      const readerRoleId = createId();
      for (const [id, name, codes, scopeType, deptIds] of [
        [
          qcRoleId,
          'QC',
          [
            list,
            'QMS:Inspection:Issues:List',
            INSPECTION_REQUEST_PERMISSION_CODES.CLOSE,
            INSPECTION_ISSUE_PERMISSION_CODES.EDIT,
          ],
          'ALL',
          [],
        ],
        [
          foreignRoleId,
          'e2e-foreign-dispatch',
          [
            list,
            INSPECTION_REQUEST_PERMISSION_CODES.DISPATCH,
            INSPECTION_REQUEST_PERMISSION_CODES.CLOSE,
          ],
          'DEPT',
          [otherDepartmentId],
        ],
        [
          readerRoleId,
          'e2e-reader',
          [
            list,
            INSPECTION_MATERIAL_PERMISSION_CODES.LIST,
            INSPECTION_RECORD_PERMISSION_CODES.LIST,
          ],
          'ALL',
          [],
        ],
      ] as const) {
        await tx.roles.create({ data: { id, name } });
        await tx.data_permission_policies.create({
          data: {
            id: createId(),
            roleId: id,
            module: 'inspection',
            scopeType,
            deptIds: JSON.stringify(deptIds),
          },
        });
        for (const code of codes) {
          const permission = await tx.rbac_permissions.upsert({
            where: { code },
            create: { id: createId(), code, name: code, module: 'inspection' },
            update: {},
          });
          await tx.rbac_role_permissions.create({
            data: { id: createId(), roleId: id, permissionId: permission.id },
          });
        }
      }
      for (const [id, suffix, realName, roleId, department] of [
        [qcId, 'qc', 'E2E QC', qcRoleId, departmentId],
        [otherQcId, 'otherqc', 'E2E Other QC', qcRoleId, departmentId],
        [
          foreignId,
          'foreign',
          'E2E Foreign Dispatcher',
          foreignRoleId,
          otherDepartmentId,
        ],
        [readerId, 'reader', 'E2E Reader', readerRoleId, departmentId],
      ]) {
        await tx.users.create({
          data: {
            id,
            username: `${username}_${suffix}`,
            realName,
            roleId,
            department,
            password: passwordHash,
            status: 'ACTIVE',
          },
        });
        await tx.rbac_user_roles.create({
          data: { id: createId(), userId: id, roleId },
        });
      }
      await tx.departments.create({
        data: { id: purchasingDepartmentId, name: 'E2E 采购部' },
      });

      for (const [categoryId, subcategoryId, scope, code, name, childName] of [
        [
          afterSalesProductCategoryId,
          afterSalesProductSubcategoryId,
          QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
          'E2E_AS_PRODUCT',
          'E2E Product',
          'E2E Product Subtype',
        ],
        [
          afterSalesDefectCategoryId,
          afterSalesDefectSubcategoryId,
          QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
          'E2E_AS_DEFECT',
          'E2E After Sales Defect',
          'E2E After Sales Subtype',
        ],
      ] as const) {
        await tx.quality_classification_categories.create({
          data: { id: categoryId, scope, code, name },
        });
        await tx.quality_classification_subcategories.create({
          data: {
            id: subcategoryId,
            categoryId,
            code: `${code}_CHILD`,
            name: childName,
          },
        });
      }
      await tx.suppliers.create({
        data: { id: supplierId, name: 'E2E Supplier', category: 'Supplier' },
      });
      await tx.suppliers.create({
        data: {
          id: outsourcingId,
          name: 'E2E Outsourcing',
          category: 'Outsourcing',
        },
      });
      await tx.quality_classification_categories.create({
        data: {
          id: defectCategoryId,
          scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
          code: 'E2E_DEFECT',
          name: 'E2E Dimensional Defect',
        },
      });
      await tx.quality_classification_subcategories.create({
        data: {
          id: defectSubcategoryId,
          categoryId: defectCategoryId,
          code: 'E2E_DIMENSION',
          name: 'E2E Dimension Mismatch',
        },
      });
      await tx.processes.create({
        data: {
          id: processId,
          name: 'E2E Fabrication',
          supplierSource: 'Supplier',
          responsibleDepartmentId: departmentId,
        },
      });
      // Manual incoming forms filter the canonical process category.
      await tx.processes.create({
        data: {
          id: incomingProcessId,
          name: 'E2E Incoming',
          supplierSource: 'Supplier',
          inspectionRequestCategory: 'INCOMING',
          responsibleDepartmentId: departmentId,
        },
      });
      await tx.inspection_request_process_options.create({
        data: {
          processId: incomingProcessId,
          category: 'INCOMING',
          isEnabled: true,
        },
      });
      await tx.inspection_request_process_options.create({
        data: { processId, category: 'PROCESS', isEnabled: true },
      });
      await tx.inspection_request_process_options.create({
        data: { processId, category: 'INCOMING', isEnabled: true },
      });
      await tx.master_parts.create({
        data: { id: partId, name: 'E2E Canonical Part' },
      });
      await tx.master_projects.create({
        data: { id: 'e2e-project-id', name: 'E2E Project' },
      });
      await tx.dictionaries.create({
        data: {
          id: customerId,
          dictType: 'customer_name',
          dictKey: 'E2E Customer',
          dictValue: 'E2E Customer',
        },
      });
      await tx.work_orders.create({
        data: {
          workOrderNumber: 'E2E-WO-001',
          customerName: 'E2E Customer',
          customerNameId: customerId,
          projectName: 'E2E Project',
          projectId: 'e2e-project-id',
          quantity: 1,
          deliveryDate: new Date('2030-01-01'),
        },
      });
      await tx.project_boms.create({
        data: {
          id: createId(),
          work_order_number: 'E2E-WO-001',
          partId,
          part_name: 'E2E Canonical Part',
        },
      });
      for (const [workOrderNumber, quantity, multiStationEnabled] of [
        ['E2E-WO-002', 1, false],
        ['E2E-WO-STATIONS', 3, true],
      ] as const) {
        await tx.work_orders.create({
          data: {
            workOrderNumber,
            customerName: 'E2E Customer',
            customerNameId: customerId,
            projectName: 'E2E Project',
            projectId: 'e2e-project-id',
            quantity,
            multiStationEnabled,
            deliveryDate: new Date('2030-01-01'),
          },
        });
        await tx.project_boms.create({
          data: {
            id: createId(),
            work_order_number: workOrderNumber,
            partId,
            part_name: 'E2E Canonical Part',
          },
        });
      }
      // Catalog parents are required by ensureModuleMenus' hierarchy resolution.
      const qms = createId();
      const inspection = createId();
      await tx.menus.create({
        data: {
          id: qms,
          path: '/qms',
          name: 'QMS',
          component: 'BasicLayout',
          type: 'catalog',
          meta: JSON.stringify({ title: '质量管理' }),
        },
      });
      await tx.menus.create({
        data: {
          id: inspection,
          parentId: qms,
          path: '/qms/inspection',
          name: 'QMSInspection',
          type: 'catalog',
          meta: JSON.stringify({ title: '检验管理' }),
        },
      });
      const afterSalesMenuId = createId();
      await tx.menus.create({
        data: {
          id: createId(),
          parentId: qms,
          path: '/qms/supplier',
          name: 'QMSSupplier',
          component: 'qms/supplier/index',
          authCode: 'QMS:Supplier:List',
          type: 'menu',
          meta: JSON.stringify({ title: '供应商管理' }),
        },
      });
      const outsourcingRoleId = createId();
      const outsourcingUserId = createId();
      await tx.roles.create({
        data: { id: outsourcingRoleId, name: 'e2e-outsourcing-governance' },
      });
      await tx.users.create({
        data: {
          id: outsourcingUserId,
          username: `${username}_outsourcing`,
          realName: 'E2E Outsourcing Manager',
          password: passwordHash,
          roleId: outsourcingRoleId,
          department: departmentId,
          status: 'ACTIVE',
        },
      });
      await tx.rbac_user_roles.create({
        data: {
          id: createId(),
          userId: outsourcingUserId,
          roleId: outsourcingRoleId,
        },
      });
      for (const [actorRoleId, namespaces, actions] of [
        [
          roleId,
          ['Supplier', 'Outsourcing'],
          ['List', 'Create', 'Edit', 'Delete'],
        ],
        [readerRoleId, ['Supplier', 'Outsourcing'], ['List']],
        [foreignRoleId, ['Supplier'], ['List', 'Edit', 'Delete']],
        [
          outsourcingRoleId,
          ['Outsourcing'],
          ['List', 'Create', 'Edit', 'Delete'],
        ],
      ] as const) {
        if (actorRoleId !== roleId) {
          await tx.data_permission_policies.create({
            data: {
              id: createId(),
              roleId: actorRoleId,
              module: 'supplier',
              scopeType: actorRoleId === foreignRoleId ? 'DEPT' : 'ALL',
              deptIds: JSON.stringify(
                actorRoleId === foreignRoleId ? [otherDepartmentId] : [],
              ),
            },
          });
        }
        for (const namespace of namespaces) {
          for (const action of actions) {
            const code = `QMS:${namespace}:${action}`;
            const permission = await tx.rbac_permissions.upsert({
              where: { code },
              create: { id: createId(), code, name: code, module: 'supplier' },
              update: {},
            });
            await tx.rbac_role_permissions.create({
              data: {
                id: createId(),
                roleId: actorRoleId,
                permissionId: permission.id,
              },
            });
          }
        }
      }
      await tx.menus.create({
        data: {
          id: afterSalesMenuId,
          parentId: qms,
          path: '/qms/after-sales',
          name: 'QMSAfterSales',
          component: 'qms/after-sales/index',
          authCode: 'QMS:AfterSales:List',
          type: 'menu',
          meta: JSON.stringify({ title: '售后问题' }),
        },
      });
      await tx.menus.create({
        data: {
          id: createId(),
          parentId: qms,
          path: '/qms/quality-loss',
          name: 'QMSQualityLoss',
          component: 'qms/quality-loss/index',
          authCode: 'QMS:LossAnalysis:List',
          type: 'menu',
          meta: JSON.stringify({ title: '质量损失' }),
        },
      });
      await tx.menus.create({
        data: {
          id: createId(),
          parentId: qms,
          path: '/qms/work-order',
          name: 'QMSWorkOrder',
          component: 'qms/work-order/index',
          authCode: 'QMS:WorkOrder:List',
          type: 'menu',
          meta: JSON.stringify({ title: '工单管理' }),
        },
      });
      // Work-order RBAC keeps Confirm separate from Edit per the module
      // contract; the reader can only list, the foreign actor is dept-scoped.
      for (const [actorRoleId, scopeType, deptIds, actions] of [
        [
          roleId,
          'ALL',
          [],
          ['List', 'Create', 'Edit', 'Confirm', 'Delete', 'Export', 'Import'],
        ],
        [readerRoleId, 'ALL', [], ['List']],
        [
          foreignRoleId,
          'DEPT',
          [otherDepartmentId],
          ['List', 'Create', 'Edit', 'Delete', 'Export'],
        ],
      ] as const) {
        // The inspection scope above already seeds an ALL policy for the
        // primary role so that the manual-incoming work-order selector can
        // read the catalog; upsert keeps the per-actor policies idempotent
        // instead of tripping the (roleId, module) unique constraint.
        await tx.data_permission_policies.upsert({
          where: {
            roleId_module: { roleId: actorRoleId, module: 'work-order' },
          },
          create: {
            id: createId(),
            roleId: actorRoleId,
            module: 'work-order',
            scopeType,
            deptIds: JSON.stringify(deptIds),
          },
          update: { scopeType, deptIds: JSON.stringify(deptIds) },
        });
        for (const action of actions) {
          const code = `QMS:WorkOrder:${action}`;
          const permission = await tx.rbac_permissions.upsert({
            where: { code },
            create: { id: createId(), code, name: code, module: 'work-order' },
            update: {},
          });
          await tx.rbac_role_permissions.create({
            data: {
              id: createId(),
              roleId: actorRoleId,
              permissionId: permission.id,
            },
          });
        }
      }
      for (const [actorRoleId, scopeType, deptIds, actions] of [
        [roleId, 'ALL', [], ['List', 'Create', 'Edit', 'Delete', 'Export']],
        [readerRoleId, 'ALL', [], ['List']],
        [
          foreignRoleId,
          'DEPT',
          [otherDepartmentId],
          ['List', 'Create', 'Edit', 'Delete', 'Export'],
        ],
      ] as const) {
        await tx.data_permission_policies.create({
          data: {
            id: createId(),
            roleId: actorRoleId,
            module: 'quality-loss',
            scopeType,
            deptIds: JSON.stringify(deptIds),
          },
        });
        for (const action of actions) {
          const code = `QMS:LossAnalysis:${action}`;
          const permission = await tx.rbac_permissions.upsert({
            where: { code },
            create: {
              id: createId(),
              code,
              name: code,
              module: 'quality-loss',
            },
            update: {},
          });
          await tx.rbac_role_permissions.create({
            data: {
              id: createId(),
              roleId: actorRoleId,
              permissionId: permission.id,
            },
          });
        }
      }
      for (const [actorRoleId, scopeType, deptIds, actions] of [
        [roleId, 'ALL', [], ['List', 'Create', 'Edit', 'Delete']],
        [readerRoleId, 'ALL', [], ['List']],
        [
          foreignRoleId,
          'DEPT',
          [otherDepartmentId],
          ['List', 'Edit', 'Delete'],
        ],
      ] as const) {
        await tx.data_permission_policies.create({
          data: {
            id: createId(),
            roleId: actorRoleId,
            module: 'after-sales',
            scopeType,
            deptIds: JSON.stringify(deptIds),
          },
        });
        for (const action of actions) {
          const code = `QMS:AfterSales:${action}`;
          const permission = await tx.rbac_permissions.upsert({
            where: { code },
            create: { id: createId(), code, name: code, module: 'after-sales' },
            update: {},
          });
          await tx.rbac_role_permissions.create({
            data: {
              id: createId(),
              roleId: actorRoleId,
              permissionId: permission.id,
            },
          });
        }
      }
      // Metrology is a shared resource catalog, with explicit write permissions.
      for (const [actorRoleId, codes] of [
        [
          roleId,
          [
            'QMS:Metrology:List',
            'QMS:Metrology:Create',
            'QMS:Metrology:Edit',
            'QMS:Metrology:Delete',
            'QMS:Metrology:Borrow:List',
            'QMS:Metrology:Borrow:Create',
            'QMS:Metrology:Borrow:Return',
            'QMS:Metrology:CalibrationPlan:List',
            'QMS:Metrology:CalibrationPlan:Create',
            'QMS:Metrology:CalibrationPlan:Edit',
            'QMS:Metrology:CalibrationPlan:Delete',
          ],
        ],
        [
          readerRoleId,
          [
            'QMS:Metrology:List',
            'QMS:Metrology:Borrow:List',
            'QMS:Metrology:CalibrationPlan:List',
          ],
        ],
        [
          foreignRoleId,
          [
            'QMS:Metrology:List',
            'QMS:Metrology:Borrow:List',
            'QMS:Metrology:CalibrationPlan:List',
          ],
        ],
      ] as const) {
        for (const code of codes) {
          const permission = await tx.rbac_permissions.upsert({
            where: { code },
            create: { id: createId(), code, name: code, module: 'metrology' },
            update: {},
          });
          await tx.rbac_role_permissions.create({
            data: {
              id: createId(),
              roleId: actorRoleId,
              permissionId: permission.id,
            },
          });
        }
      }
      // Supervision is creator-scoped with module RBAC permissions.
      for (const [actorRoleId, codes] of [
        [
          roleId,
          [
            'QMS:Supervision:List',
            'QMS:Supervision:Create',
            'QMS:Supervision:Edit',
            'QMS:Supervision:Delete',
          ],
        ],
        [readerRoleId, ['QMS:Supervision:List']],
        [
          foreignRoleId,
          [
            'QMS:Supervision:List',
            'QMS:Supervision:Create',
            'QMS:Supervision:Edit',
            'QMS:Supervision:Delete',
          ],
        ],
      ] as const) {
        for (const code of codes) {
          const permission = await tx.rbac_permissions.upsert({
            where: { code },
            create: { id: createId(), code, name: code, module: 'supervision' },
            update: {},
          });
          await tx.rbac_role_permissions.create({
            data: {
              id: createId(),
              roleId: actorRoleId,
              permissionId: permission.id,
            },
          });
        }
      }
    });
    const requestsBeforeUI = await prisma.qms_inspection_requests.count();
    if (requestsBeforeUI !== 0)
      throw new Error('Seed created a tested request');
    const afterSalesBeforeUI = await prisma.after_sales.count();
    if (afterSalesBeforeUI !== 0)
      throw new Error('Seed created a tested after-sales record');
    const qualityLossBeforeUI = await prisma.quality_losses.count();
    if (qualityLossBeforeUI !== 0)
      throw new Error('Seed created tested quality-loss business data');
    const qualityLossIndexBeforeUI = await prisma.quality_loss_index.count();
    if (qualityLossIndexBeforeUI !== 0)
      throw new Error('Seed created tested quality-loss index data');
    const metrologyBeforeUI = {
      instruments: await prisma.measuring_instruments.count(),
      borrows: await prisma.metrology_borrow_records.count(),
      plans: await prisma.metrology_calibration_plans.count(),
    };
    if (Object.values(metrologyBeforeUI).some((count) => count !== 0))
      throw new Error('Seed created tested metrology business data');
    const supervisionBeforeUI = {
      projects: await prisma.supervision_projects.count(),
      reports: await prisma.supervision_daily_reports.count(),
      issues: await prisma.supervision_issues.count(),
      planTasks: await prisma.supervision_plan_tasks.count(),
    };
    if (Object.values(supervisionBeforeUI).some((count) => count !== 0))
      throw new Error('Seed created tested supervision business data');
    // Work orders already exist as cross-module prerequisites (inspection,
    // quality loss, metrology). The tested baseline is therefore recorded,
    // not asserted as zero, and every case creates its own numbered order.
    const workOrderBeforeUI = await prisma.work_orders.findMany({
      select: { workOrderNumber: true },
      orderBy: { workOrderNumber: 'asc' },
    });
    const workOrderRequirementBeforeUI =
      await prisma.work_order_requirements.count();
    if (workOrderRequirementBeforeUI !== 0)
      throw new Error('Seed created tested work-order requirement data');
    const directory = process.env.QGS_E2E_ARTIFACT_DIR;
    const supplierBeforeUI = await prisma.suppliers.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (
      supplierBeforeUI.length !== 2 ||
      !supplierBeforeUI.every((row) =>
        [outsourcingId, supplierId].includes(row.id),
      )
    )
      throw new Error(
        'Supplier seed must contain only the two referenced prerequisites',
      );
    if (!directory) throw new Error('Missing owned artifact directory');
    await writeFile(
      join(directory, 'seed.json'),
      JSON.stringify(
        {
          runId: process.env.QGS_E2E_RUN_ID,
          departmentId,
          roleId,
          userId,
          partId,
          processId,
          incomingProcessId,
          customerId,
          qcId,
          otherQcId,
          foreignId,
          readerId,
          otherDepartmentId,
          supplierId,
          outsourcingId,
          defectCategoryId,
          defectSubcategoryId,
          purchasingDepartmentId,
          afterSalesProductCategoryId,
          afterSalesProductSubcategoryId,
          afterSalesDefectCategoryId,
          afterSalesDefectSubcategoryId,
          afterSalesBeforeUI,
          qualityLossBeforeUI,
          qualityLossIndexBeforeUI,
          metrologyBeforeUI,
          metrologyBorrowerNameId,
          supervisionBeforeUI,
          supplierBeforeUI,
          requestsBeforeUI,
          workOrderBeforeUI,
          workOrderRequirementBeforeUI,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  const kind = error instanceof Error ? error.name : 'UnknownError';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code).replaceAll(/[^\w-]/g, '')
      : 'none';
  process.stderr.write(
    `Isolated E2E seed failed (${kind}, code=${code}; details suppressed)\n`,
  );
  process.exitCode = 1;
});
