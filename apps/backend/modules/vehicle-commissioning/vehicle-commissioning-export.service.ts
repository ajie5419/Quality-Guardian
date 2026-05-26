import type { VehicleCommissioningIssueParams } from '@qgs/shared';

import type { VehicleCommissioningService } from './vehicle-commissioning.service';

import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

import sharp from 'sharp';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { UPLOAD_DIR } from '~/utils/paths';

import {
  getVehicleCommissioningSeverityLabel,
  getVehicleCommissioningStatusLabel,
} from './vehicle-commissioning-issue-format';

const IMAGE_COLUMN_KEY = 'photos';
const IMAGE_SIZE = {
  width: 64,
  height: 64,
};

type VehicleCommissioningIssueReader = Pick<
  typeof VehicleCommissioningService,
  'getIssues'
>;

function getImageExtension(input: string): 'gif' | 'jpeg' | 'png' | undefined {
  const ext = extname(input.split('?')[0] || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.png') return 'png';
  if (ext === '.gif') return 'gif';
  return undefined;
}

function normalizeUploadObjectKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = raw.startsWith('http')
      ? new URL(raw)
      : new URL(raw, 'http://local');
    return decodeURIComponent(parsed.pathname)
      .replace(/^\/api\/uploads\//, '')
      .replace(/^\/uploads\//, '')
      .replace(/^\/+/, '');
  } catch {
    return raw
      .replace(/^\/api\/uploads\//, '')
      .replace(/^\/uploads\//, '')
      .replace(/^\/+/, '');
  }
}

async function loadImageForExcel(url: string) {
  const objectKey = normalizeUploadObjectKey(url);
  if (!objectKey) return null;

  let buffer: Uint8Array | undefined;
  const localPath = resolve(UPLOAD_DIR, objectKey);
  const relativePath = relative(UPLOAD_DIR, localPath);
  if (
    !relativePath.startsWith('..') &&
    !relativePath.includes('\0') &&
    existsSync(localPath)
  ) {
    buffer = readFileSync(localPath);
  } else {
    const storedName = objectKey.split('/').pop() || objectKey;
    const managed =
      await FileStorageService.getFileBufferByStoredName(storedName);
    buffer = managed?.buffer;
  }

  if (!buffer) return null;
  const extension = getImageExtension(objectKey);
  if (extension) {
    return {
      base64: Buffer.from(buffer).toString('base64'),
      extension,
    };
  }
  const pngBuffer = await sharp(buffer).png().toBuffer();
  return {
    base64: Buffer.from(pngBuffer).toString('base64'),
    extension: 'png' as const,
  };
}

export async function exportVehicleCommissioningIssuesWorkbook(
  service: VehicleCommissioningIssueReader,
  params: VehicleCommissioningIssueParams,
) {
  const data = await service.getIssues(params);
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.Workbook();
  const sheet = workbook.addWorksheet('Commissioning Issues');
  sheet.columns = [
    { header: '日期', key: 'date', width: 14 },
    { header: '工单号', key: 'workOrderNumber', width: 18 },
    { header: '项目名称', key: 'projectName', width: 20 },
    { header: '部件名称', key: 'partName', width: 18 },
    { header: '问题描述', key: 'description', width: 30 },
    { header: '责任部门', key: 'responsibleDepartment', width: 16 },
    { header: '严重程度', key: 'severity', width: 12 },
    { header: '状态', key: 'status', width: 12 },
    { header: '是否索赔', key: 'isClaim', width: 12 },
    { header: '预计损失', key: 'lossAmount', width: 14 },
    { header: '已索赔金额', key: 'recoveredAmount', width: 14 },
    { header: '索赔状态', key: 'claimStatus', width: 14 },
    { header: '索赔备注', key: 'claimNotes', width: 24 },
    { header: '处理建议', key: 'solution', width: 30 },
    { header: '照片', key: IMAGE_COLUMN_KEY, width: 14 },
  ];

  for (const item of data.items) {
    const row = sheet.addRow({
      date: item.date,
      workOrderNumber: item.workOrderNumber || '',
      projectName: item.projectName || '',
      partName: item.partName || '',
      description: item.description || '',
      responsibleDepartment: item.responsibleDepartment || '',
      severity: getVehicleCommissioningSeverityLabel(item.severity),
      status: getVehicleCommissioningStatusLabel(item.status),
      isClaim: item.isClaim ? '是' : '否',
      lossAmount: item.lossAmount || 0,
      recoveredAmount: item.recoveredAmount || 0,
      claimStatus: item.claimStatus || '',
      claimNotes: item.claimNotes || '',
      solution: item.solution || '',
      [IMAGE_COLUMN_KEY]: '',
    });
    const photo = item.photos?.[0];
    row.height = photo ? 52 : undefined;
    if (!photo) continue;
    try {
      const image = await loadImageForExcel(photo);
      if (!image) {
        row.getCell(IMAGE_COLUMN_KEY).value = photo;
        continue;
      }
      const imageId = workbook.addImage({
        base64: image.base64,
        extension: image.extension,
      });
      sheet.addImage(imageId, {
        tl: { col: 14.15, row: row.number - 1 + 0.1 },
        ext: IMAGE_SIZE,
      });
    } catch {
      row.getCell(IMAGE_COLUMN_KEY).value = photo;
    }
  }

  sheet.getRow(1).font = { bold: true };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
