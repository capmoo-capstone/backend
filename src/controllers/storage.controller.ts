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
import { prisma } from '../config/prisma';
import { Capability, assertCapability } from '../lib/access-policy';
import { projectReadWhere } from '../lib/project-scope';
import { ForbiddenError } from '../lib/errors';

// Client calls this BEFORE uploading — gets back a URL + the key to save later
export const presignUpload = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Storage']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/PresignUploadDto' } }
  const data = PresignUploadSchema.parse(req.body);
  if (!req.user) throw new ForbiddenError('Not authenticated');
  assertCapability(req.user, Capability.PROJECT_UPDATE);
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, ...projectReadWhere(req.user) },
    select: { id: true },
  });
  if (!project)
    throw new ForbiddenError('You do not have access to this project');

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
  if (!req.user) throw new ForbiddenError('Not authenticated');
  const document = await prisma.projectSubmission.findFirst({
    where: {
      documents: { some: { file_path: data.key } },
      project: projectReadWhere(req.user),
    },
    select: { id: true },
  });
  if (!document)
    throw new ForbiddenError('You do not have access to this file');
  const downloadUrl = await generatePresignedDownloadUrl(data.key);
  res.status(200).json({ downloadUrl, expiresIn: 3600 });
};

export const deleteFile = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Storage']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/PresignDownload' } }
  const data = PresignDownloadSchema.parse(req.body);
  if (!req.user) throw new ForbiddenError('Not authenticated');
  assertCapability(req.user, Capability.PROJECT_DELETE);
  await deleteObject(data.key);
  res.status(204).send();
};
