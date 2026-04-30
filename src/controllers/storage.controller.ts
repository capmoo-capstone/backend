import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.type';
import {
  PresignUploadSchema,
  PresignDownloadSchema,
} from '../schemas/storage.schema';
import {
  buildObjectKey,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
} from '../services/storage.service';

// Client calls this BEFORE uploading — gets back a URL + the key to save later
export const presignUpload = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Storage']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/PresignUploadDto' } }
  const data = PresignUploadSchema.parse(req.body);

  const key = buildObjectKey({
    projectId: data.projectId,
    workflowType: data.workflowType,
    stepOrder: data.stepOrder,
    fileName: data.fileName,
  });

  const uploadUrl = await generatePresignedUploadUrl(key, data.contentType);

  res.status(200).json({
    uploadUrl, // PUT your file here
    key, // save this — you'll pass it as file_path when creating the submission
    expiresIn: 300,
  });
};

// Client calls this AFTER the submission is saved — gets back a viewable URL
export const presignDownload = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Storage']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/PresignDownload' } }
  const data = PresignDownloadSchema.parse(req.body);
  const downloadUrl = await generatePresignedDownloadUrl(data.key);
  res.status(200).json({ downloadUrl, expiresIn: 3600 });
};
