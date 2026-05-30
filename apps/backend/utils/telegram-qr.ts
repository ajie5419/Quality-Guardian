import { Buffer } from 'node:buffer';

import QRCode from 'qrcode';
import sharp from 'sharp';

export async function generateCloseQrImage(
  requestId: string,
  inspectorName: string,
  baseUrl: string,
): Promise<Buffer> {
  const origin = baseUrl.replace(/\/+$/, '');
  const url = `${origin}/#/qms/inspection/requests?dispatchRequestId=${requestId}`;
  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    type: 'png',
    width: 400,
  });

  const label = `检验员: ${inspectorName}`;
  const labelSvg = `
    <svg width="400" height="50">
      <text x="200" y="35" font-size="24" font-family="sans-serif"
            text-anchor="middle" fill="#333">${escapeXml(label)}</text>
    </svg>`;

  const labelBuffer = await sharp(Buffer.from(labelSvg)).png().toBuffer();

  return sharp(qrBuffer)
    .extend({ bottom: 50, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .composite([{ input: labelBuffer, gravity: 'south' }])
    .png()
    .toBuffer();
}

function escapeXml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
