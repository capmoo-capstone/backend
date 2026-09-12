import { BusinessEmailContent, escapeHtml } from '../business-email-content';

export interface VendorPoEmailData {
  poNumber: string;
  vendorName?: string | null;
  additionalMessage?: string | null;
}

export interface VendorPoEmailPreview {
  subject: string;
  lockedBody: string;
  vendorFormUrl: string;
  autoNotice: string;
}

const AUTOMATED_NOTICE =
  '(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)';

const CU_PROCUREMENT_CLOSING_TEXT = [
  'ขอแสดงความนับถือ',
  'ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย',
  'ชั้น 2 อาคารจามจุรี 5 ถนนพญาไท',
  'แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330',
  'หมายเลขโทรศัพท์: 0 2218 0080',
  '',
  AUTOMATED_NOTICE,
].join('\n');

const CU_PROCUREMENT_CLOSING_HTML = [
  '<p>ขอแสดงความนับถือ<br /><strong>ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย</strong><br />ชั้น 2 อาคารจามจุรี 5 ถนนพญาไท<br />แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330<br />หมายเลขโทรศัพท์: 0 2218 0080</p>',
  `<p><em>${AUTOMATED_NOTICE}</em></p>`,
].join('\n');

export const buildVendorFormUrl = (poNumber?: string | null): string => {
  const envAppUrl = (
    process.env.VENDOR_APP_PUBLIC_URL ||
    process.env.APP_PUBLIC_URL ||
    ''
  ).trim();
  const baseUrl = envAppUrl
    ? envAppUrl.replace(/\/+$/, '')
    : 'https://vendor.nexus-procure.com';

  return baseUrl;
};

export const renderVendorPoEmailPreview = (
  data: VendorPoEmailData
): VendorPoEmailPreview => {
  const poLabel = data.poNumber?.trim() || '-';
  const label = data.vendorName?.trim() || 'บริษัทคู่ค้า';
  const vendorFormUrl = buildVendorFormUrl(data.poNumber);

  const lockedBody = [
    `เรียน ${label}`,
    '',
    `ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย ขอแจ้งให้ท่านทราบว่าขณะนี้ถึงเวลาส่งใบแจ้งหนี้/ใบส่งของ/ใบวางบิลของใบสั่งซื้อหมายเลข ${poLabel} แล้ว ฝ่ายการพัสดุฯ จึงขอให้ท่านส่งเอกสารดังกล่าวในระบบ NexusProcure ผ่านลิงก์ ${vendorFormUrl}`,
    '',
    `ฝ่ายการพัสดุฯ ขอให้ท่านระบุหมายเลขของใบสั่งซื้อของท่าน คือ ${poLabel} ทุกครั้ง เมื่อมีการส่งเอกสารผ่านระบบเกิดขึ้น`,
  ].join('\n');

  const subject = `ส่งใบแจ้งหนี้/ใบส่งของ/ใบวางบิล สำหรับใบสั่งซื้อหมายเลข ${poLabel}`;

  return {
    subject,
    lockedBody,
    vendorFormUrl,
    autoNotice: AUTOMATED_NOTICE,
  };
};

export const renderVendorPoEmailContent = (
  data: VendorPoEmailData
): BusinessEmailContent => {
  const preview = renderVendorPoEmailPreview(data);
  const poLabel = data.poNumber?.trim() || '-';
  const label = data.vendorName?.trim() || 'บริษัทคู่ค้า';

  const textParts = [preview.lockedBody];

  if (data.additionalMessage && data.additionalMessage.trim()) {
    textParts.push('', data.additionalMessage.trim());
  }

  textParts.push('', CU_PROCUREMENT_CLOSING_TEXT);

  const htmlParts = [
    `<p>เรียน ${escapeHtml(label)}</p>`,
    `<p>ฝ่ายการพัสดุ สำนักบริหารการเงิน การบัญชี และการพัสดุ จุฬาลงกรณ์มหาวิทยาลัย ขอแจ้งให้ท่านทราบว่าขณะนี้ถึงเวลาส่งใบแจ้งหนี้/ใบส่งของ/ใบวางบิลของใบสั่งซื้อหมายเลข <strong>${escapeHtml(poLabel)}</strong> แล้ว ฝ่ายการพัสดุฯ จึงขอให้ท่านส่งเอกสารดังกล่าวในระบบ NexusProcure ผ่านลิงก์ <a href="${escapeHtml(preview.vendorFormUrl)}">${escapeHtml(preview.vendorFormUrl)}</a></p>`,
    `<p>ฝ่ายการพัสดุฯ ขอให้ท่านระบุหมายเลขของใบสั่งซื้อของท่าน คือ <strong>${escapeHtml(poLabel)}</strong> ทุกครั้ง เมื่อมีการส่งเอกสารผ่านระบบเกิดขึ้น</p>`,
  ];

  if (data.additionalMessage && data.additionalMessage.trim()) {
    const additionalHtml = data.additionalMessage
      .trim()
      .split('\n')
      .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
      .join('\n');
    htmlParts.push(additionalHtml);
  }

  htmlParts.push(CU_PROCUREMENT_CLOSING_HTML);

  return {
    subject: preview.subject,
    text: textParts.join('\n'),
    html: htmlParts.join('\n'),
  };
};
