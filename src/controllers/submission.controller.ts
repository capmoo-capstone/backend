import { Request, Response } from 'express';
import * as SubmissionService from '../services/submission.service';
import { AuthenticatedRequest } from '../types/auth.type';
import {
  CreateSubmissionSchema,
  ApproveSubmissionSchema,
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

export const createSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;

  const validateData = CreateSubmissionSchema.parse(req.body);
  const submission = await SubmissionService.createStaffSubmissionsProject(
    payload,
    validateData
  );
  res.status(201).json(submission);
};

const approveSubmission = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
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

const proposeSubmission = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const submissionId = req.params.id as string;

  const submission = await SubmissionService.proposeSubmission(
    payload,
    submissionId
  );
  res.status(200).json(submission);
};

const signAndCompleteSubmission = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const submissionId = req.params.id as string;

  const submission = await SubmissionService.signAndCompleteSubmission(
    payload,
    submissionId
  );
  res.status(200).json(submission);
};

const rejectSubmission = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
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

export const handleSubmissionAction = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/SubmissionActionDto' } }
  const action = req.params.action as string;
  switch (action) {
    case 'approve':
      return approveSubmission(req, res);
    case 'propose':
      return proposeSubmission(req, res);
    case 'sign':
      return signAndCompleteSubmission(req, res);
    case 'reject':
      return rejectSubmission(req, res);
    default:
      res.status(400).json({ message: 'Invalid action' });
  }
};
