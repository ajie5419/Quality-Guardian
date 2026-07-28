import type { QualityClassificationScope } from '@qgs/shared';

import { createId } from '@paralleldrive/cuid2';
import { QUALITY_CLASSIFICATION_SCOPE } from '@qgs/shared';
import prisma from '~/utils/prisma';

interface ClassificationSeed {
  code: string;
  name: string;
  scope: QualityClassificationScope;
  subcategories: Array<{ code: string; name: string }>;
}

const subcategories = (entries: Array<readonly [code: string, name: string]>) =>
  entries.map(([code, name]) => ({ code, name }));

export const QUALITY_CLASSIFICATION_SEEDS: ClassificationSeed[] = [
  {
    code: 'DESIGN_DEFECT',
    name: '设计缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
    subcategories: subcategories([
      ['INTERFERENCE', '干涉'],
      ['DIMENSION_ERROR', '尺寸错误'],
      ['PROGRAM_ERROR', '程序错误'],
      ['SELECTION_ISSUE', '选型问题'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'PROCESS_DEFECT',
    name: '工艺缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
    subcategories: subcategories([
      ['BOM_ERROR', '料单错误'],
      ['WELDING_PROCESS', '焊接工艺问题'],
      ['PAIRING_PROCESS', '组对工艺问题'],
      ['ASSEMBLY_PROCESS', '装配工艺问题'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'MANUFACTURING_DEFECT',
    name: '制造缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
    subcategories: subcategories([
      ['MACHINING_ACCURACY', '加工精度缺陷'],
      ['ASSEMBLY_DEFECT', '装配缺陷'],
      ['WELDING_DEFECT', '焊接缺陷'],
      ['SURFACE_TREATMENT', '表面处理缺陷'],
      ['OPERATOR_ERROR', '人员操作问题'],
      ['EQUIPMENT_ISSUE', '设备问题'],
      ['APPEARANCE_DEFECT', '外观缺陷'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'COMPONENT_DEFECT',
    name: '零部件缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
    subcategories: subcategories([
      ['DRAWING_MISMATCH', '与图纸协议不符'],
      ['APPEARANCE_ISSUE', '外观问题'],
      ['FUNCTION_FAILURE', '功能失效'],
      ['WRONG_MODEL', '型号错误'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'OTHER_DEFECT',
    name: '其他缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
    subcategories: subcategories([['OTHER', '其他']]),
  },
  {
    code: 'VEHICLE_PRODUCT',
    name: '车辆产品',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
    subcategories: subcategories([
      ['FLATBED_TRUCK', '平板车'],
      ['DOUBLE_HEADED_TRUCK', '双头车'],
      ['POT_CARRIER', '抱罐车'],
      ['EXPLOSION_PROOF_TRUCK', '防爆车'],
      ['HOT_METAL_TRAILER', '铁水挂车'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'BRIDGE_PRODUCT',
    name: '路桥产品',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
    subcategories: subcategories([
      ['BRIDGE_GIRDER_LAUNCHER', '架桥机'],
      ['RAIL_GIRDER_CRANE', '轮轨提梁机'],
      ['TYRE_GIRDER_CRANE', '轮胎提梁机'],
      ['GANTRY_CRANE', '门吊'],
      ['INTEGRATED_MACHINE', '一体机'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'MOLD_PRODUCT',
    name: '模具产品',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
    subcategories: subcategories([
      ['WIND_TOWER_MOLD', '风电塔筒模具'],
      ['SUBWAY_SEGMENT_MOLD', '地铁管片模具'],
      ['HORIZONTAL_MOLD', '卧式模具'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'OTHER_PRODUCT',
    name: '其他',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
    subcategories: subcategories([['OTHER', '其他']]),
  },
  {
    code: 'DESIGN_DEFECT',
    name: '设计缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    subcategories: subcategories([
      ['MECHANICAL_DESIGN', '机械设计'],
      ['HYDRAULIC_DESIGN', '液压设计'],
      ['ELECTRICAL_DESIGN', '电气设计'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'MANUFACTURING_ASSEMBLY_DEFECT',
    name: '制造装配缺陷',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    subcategories: subcategories([
      ['WELDING_DEFECT', '焊接缺陷'],
      ['MACHINING_DEVIATION', '加工尺寸偏差'],
      ['MISSING_MACHINING', '漏加工'],
      ['MANUFACTURING_INTERFERENCE', '制造干涉'],
      ['INSTALLATION_MISALIGNMENT', '安装错位'],
      ['OIL_LEAKAGE', '漏油渗油'],
      ['LOOSE_FASTENER', '紧固件松动'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'COMPONENT_QUALITY',
    name: '零部件质量',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    subcategories: subcategories([
      ['FUNCTION_FAILURE', '功能失效'],
      ['COMPONENT_FAILURE', '元器件故障'],
      ['INHERENT_QUALITY', '本身质量问题'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'IMPROPER_MAINTENANCE',
    name: '维护保养不当',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    subcategories: subcategories([
      ['FLUID_DETERIORATION', '油液变质'],
      ['LOOSE_FASTENER', '紧固件松动'],
      ['DELAYED_LUBRICATION', '润滑不及时'],
      ['MISSED_PERIODIC_INSPECTION', '未按定期点检'],
      ['OTHER', '其他'],
    ]),
  },
  {
    code: 'IMPROPER_OPERATION',
    name: '操作不当',
    scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
    subcategories: subcategories([
      ['MISOPERATION', '误操作'],
      ['OVERLOAD', '超载使用'],
      ['HARSH_ENVIRONMENT', '恶劣环境作业'],
      ['ROUGH_OPERATION', '暴力操作'],
      ['OTHER', '其他'],
    ]),
  },
];

export interface QualityClassificationBootstrapResult {
  categoriesCreated: number;
  subcategoriesCreated: number;
}

export async function bootstrapQualityClassifications(): Promise<QualityClassificationBootstrapResult> {
  const categoryResult =
    await prisma.quality_classification_categories.createMany({
      data: QUALITY_CLASSIFICATION_SEEDS.map((seed, sort) => ({
        code: seed.code,
        id: createId(),
        name: seed.name,
        scope: seed.scope,
        sort,
      })),
      skipDuplicates: true,
    });

  const categories = await prisma.quality_classification_categories.findMany({
    where: {
      OR: QUALITY_CLASSIFICATION_SEEDS.map((seed) => ({
        code: seed.code,
        scope: seed.scope,
      })),
    },
    select: { code: true, id: true, scope: true },
  });
  const categoryByKey = new Map(
    categories.map((item) => [`${item.scope}:${item.code}`, item.id]),
  );
  const subcategoryData = QUALITY_CLASSIFICATION_SEEDS.flatMap(
    (seed, categorySort) => {
      const categoryId = categoryByKey.get(`${seed.scope}:${seed.code}`);
      if (!categoryId) {
        throw new Error(
          `Quality classification category bootstrap incomplete: ${seed.scope}:${seed.code}`,
        );
      }
      return seed.subcategories.map((subcategory, sort) => ({
        categoryId,
        code: subcategory.code,
        id: createId(),
        name: subcategory.name,
        sort: categorySort * 100 + sort,
      }));
    },
  );
  const subcategoryResult =
    await prisma.quality_classification_subcategories.createMany({
      data: subcategoryData,
      skipDuplicates: true,
    });
  const persistedSubcategories =
    await prisma.quality_classification_subcategories.findMany({
      where: { categoryId: { in: [...categoryByKey.values()] } },
      select: { categoryId: true, code: true },
    });
  const persistedKeys = new Set(
    persistedSubcategories.map((item) => `${item.categoryId}:${item.code}`),
  );
  const missing = subcategoryData.filter(
    (item) => !persistedKeys.has(`${item.categoryId}:${item.code}`),
  );
  if (missing.length > 0) {
    throw new Error(
      `Quality classification subcategory bootstrap incomplete: ${missing.length} missing`,
    );
  }

  return {
    categoriesCreated: categoryResult.count,
    subcategoriesCreated: subcategoryResult.count,
  };
}
