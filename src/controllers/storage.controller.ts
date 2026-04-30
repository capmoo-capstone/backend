import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.type';
import {
  PresignUploadSchema,
  PresignDownloadSchema,
  VendorPresignUploadSchema,
} from '../schemas/storage.schema';
import {
  buildObjectKey,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  buildVendorObjectKey,
  deleteObject,
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
    uploadUrl,
    key,
    expiresIn: 300,
  });
};

export const vendorPresignUpload = async (req: Request, res: Response) => {
  const data = VendorPresignUploadSchema.parse(req.body);

  const key = buildVendorObjectKey({
    poNo: data.poNo,
    fileName: data.fileName,
  });

  const uploadUrl = await generatePresignedUploadUrl(key, data.contentType);

  res.status(200).json({
    uploadUrl,
    key,
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

export const deleteFile = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Storage']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/PresignDownload' } }
  const data = PresignDownloadSchema.parse(req.body);
  await deleteObject(data.key);
  res.status(204).send();
};
