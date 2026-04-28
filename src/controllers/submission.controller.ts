import { Request, Response } from 'express';
import * as SubmissionService from '../services/submission.service';
import { AuthenticatedRequest } from '../types/auth.type';
import {
  ApproveSubmissionSchema,
  CreateStaffSubmissionSchema,
  CreateVendorSubmissionSchema,
  RejectSubmissionSchema,
} from '../schemas/submission.schema';

export const getProjectSubmissions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.projectId as string;

  const submissions = await SubmissionService.getProjectSubmissions(
    payload,
    projectId
  );
  res.status(200).json(submissions);
};

export const getVendorSubmissions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const { page, limit, q, from, to } = req.query;

  const submissions = await SubmissionService.getVendorSubmissions(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    { search: q as string, dateFrom: from as string, dateTo: to as string }
  );
  res.status(200).json(submissions);
};

export const createStaffSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;

  const validateData = CreateStaffSubmissionSchema.parse(req.body);
  const submission = await SubmissionService.createStaffSubmissionsProject(
    payload,
    validateData
  );
  res.status(201).json(submission);
};

export const createVendorSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;

  const validateData = CreateVendorSubmissionSchema.parse(req.body);
  const submission = await SubmissionService.createVendorSubmissionsProject(
    payload,
    validateData
  );
  res.status(201).json(submission);
};

export const approveSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/SubmissionActionDto' } }
  const payload = req.user!;
  const submissionId = req.params.id as string;

  const validateData = ApproveSubmissionSchema.parse({
    id: submissionId,
    ...req.body,
  });
  const submission = await SubmissionService.approveSubmission(
    payload,
    validateData
  );
  res.status(200).json(submission);
};

export const proposeSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/SubmissionActionDto' } }
  const payload = req.user!;
  const submissionId = req.params.id as string;

  const submission = await SubmissionService.proposeSubmission(
    payload,
    submissionId
  );
  res.status(200).json(submission);
};

export const signAndCompleteSubmission = async (
  req: AuthenticatedRequest,

  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/SubmissionActionDto' } }
  const payload = req.user!;
  const submissionId = req.params.id as string;

  const submission = await SubmissionService.signAndCompleteSubmission(
    payload,
    submissionId
  );
  res.status(200).json(submission);
};

export const rejectSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/SubmissionActionDto' } }
  const payload = req.user!;
  const submissionId = req.params.id as string;

  const validateData = RejectSubmissionSchema.parse({
    id: submissionId,
    ...req.body,
  });
  const submission = await SubmissionService.rejectSubmission(
    payload,
    validateData
  );
  res.status(200).json(submission);
};
