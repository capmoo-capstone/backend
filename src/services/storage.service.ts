import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2 } from '../config/r2';
import {
  PRESIGN_DOWNLOAD_EXPIRES,
  PRESIGN_UPLOAD_EXPIRES,
} from '../lib/constant';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = process.env.R2_BUCKET_NAME!;

// Builds a consistent key path so files are organized in R2
// Example: submissions/abc-123/LT500K/step2/filename.pdf
export const buildObjectKey = (params: {
  projectId: string;
  workflowType: string;
  stepOrder: number;
  fileName: string;
}): string => {
  const { projectId, workflowType, stepOrder, fileName } = params;
  const uuid = uuidv4();
  const safe = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_'); // sanitize filename
  return `${projectId}/submissions/${workflowType}/step${stepOrder}/${uuid}-${safe}`;
};

export const buildVendorObjectKey = (params: {
  poNo: string;
  fileName: string;
}): string => {
  const { poNo, fileName } = params;
  const uuid = uuidv4();
  const safe = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  return `vendors/${poNo}/${uuid}-${safe}`;
};

// Returns a short-lived URL the client can PUT a file to directly
export const generatePresignedUploadUrl = async (
  key: string,
  contentType: string
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: PRESIGN_UPLOAD_EXPIRES });
};

// Returns a short-lived URL anyone with the link can GET (download/view)
export const generatePresignedDownloadUrl = async (
  key: string
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn: PRESIGN_DOWNLOAD_EXPIRES });
};

// Deletes a file from R2 — call this when deleting a document record
export const deleteObject = async (key: string): Promise<void> => {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
};
