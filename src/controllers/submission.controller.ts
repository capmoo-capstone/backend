import { Request, Response } from 'express';
import * as SubmissionService from '../service/submission.service';
import {
  CreateSubmissionSchema,
  ApproveSubmissionSchema,
  RejectSubmissionSchema,
} from '../models/Submission';

export const getProjectSubmissions = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const projectId = req.params.projectId as string;

  const submissions = await SubmissionService.getProjectSubmissions(
    { id },
    projectId
  );
  res.status(200).json(submissions);
};

export const createSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;

  const validateData = CreateSubmissionSchema.parse(req.body);
  const submission = await SubmissionService.createStaffSubmissionsProject(
    { id },
    validateData
  );
  res.status(201).json(submission);
};

export const approveSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const submissionId = req.params.id as string;

  const validateData = ApproveSubmissionSchema.parse({
    id: submissionId,
    required_signature: req.body.requiredSignature,
  });
  const submission = await SubmissionService.approveSubmission(
    { id },
    validateData
  );
  res.status(200).json(submission);
};

export const proposeSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const submissionId = req.params.id as string;

  const submission = await SubmissionService.proposeSubmission(
    { id },
    submissionId
  );
  res.status(200).json(submission);
};

export const signAndCompleteSubmission = async (
  req: Request,
  res: Response
) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const submissionId = req.params.id as string;

  const submission = await SubmissionService.signAndCompleteSubmission(
    { id },
    submissionId
  );
  res.status(200).json(submission);
};

export const rejectSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const submissionId = req.params.id as string;

  const validateData = RejectSubmissionSchema.parse({
    id: submissionId,
    comment: req.body.comment,
  });
  const submission = await SubmissionService.rejectSubmission(
    { id },
    validateData
  );
  res.status(200).json(submission);
};
