# METRIC-GOVERNANCE-001 / PHASE-1.7A

## PHASE-2 Readiness Gate

本文件只登记治理模型完成后的迁移资格，不执行消费者迁移、不激活指标、不改变业务计算。

| Metric | Definition Status | Approval Evidence | Owner Status | Policy Status | Historical/DataScope Gate | PHASE-2 Status |
| --- | --- | --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-FINAL-PASS-RATE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-GROSS-QUALITY-LOSS | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-NET-QUALITY-LOSS | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-CLAIM-RECOVERY | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-PROBLEM-CLOSURE-RATE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-PROBLEM-ONTIME-CLOSURE-RATE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | POLICY_PENDING deadline | Required before shadow | BLOCKED_POLICY |
| BM-AFTER-SALES-NET-LOSS | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-SUPPLIER-FINAL-SCORE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | Two policy records required | Required before shadow | READY_FOR_SHADOW |
| BM-REINSPECTION-RATE | DRAFT/v1 | APPROVED_WITH_POLICY_PENDING | CONFIRMED_FROM_APPROVAL responsibility | POLICY_PENDING revision key/dedup | Required before shadow | BLOCKED_POLICY |
| BM-INSPECTION-POINT-COMPLETION | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-INSPECTION-QUANTITY-COVERAGE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-INSPECTION-REQUEST-CLOSURE-RATE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-VEHICLE-FAILURE-COUNT | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-ARCHIVE-TIMELINESS | DRAFT/v1 | APPROVED_WITH_POLICY_PENDING | CONFIRMED_FROM_APPROVAL responsibility | POLICY_PENDING calendar | Required before shadow | BLOCKED_POLICY |
| BM-DFMEA-RPN-VALUE | DRAFT/v1 | APPROVED | CONFIRMED_FROM_APPROVAL responsibility | APPROVED | Required before shadow | READY_FOR_SHADOW |
| BM-DFMEA-RISK-BAND | DRAFT/v1 | APPROVED_WITH_POLICY_PENDING | CONFIRMED_FROM_APPROVAL responsibility | POLICY_PENDING threshold/version | Required before shadow | BLOCKED_POLICY |

## Gate Rules

READY_FOR_SHADOW means canonical calculation may be implemented and compared in shadow mode after historical and DataScope validation. It does not permit production cutover or activation.

BLOCKED_POLICY means a policy can change the metric result and must be resolved before shadow validation is treated as authoritative.

All metrics require:

- Approval Evidence and decision trace;
- canonical Version row;
- business responsibility assignment without fabricated ownerDeptId;
- historical computability confirmation;
- DataScope confirmation;
- consumer inventory before any later migration.

## Governance Model Completion

The Registry model now separates:

1. metric_canonical_mappings for legacy-to-canonical lineage;
2. metric_approval_evidences for append-only approval records;
3. metric_policy_dependencies for non-executable pending policies;
4. metric_owner_assignments for multi-owner responsibility;
5. activation readiness validation for evidence, owner, effective date and policy gates.

No metric is ACTIVE in PHASE-1.7A.
