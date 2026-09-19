import express from "express";
import multer from "multer";

import {
    createWorkflow,
    getAllWorkflows,
    createWorkflowRun,
    submitWorkflowStage,
    getWorkflowById,
    downloadWorkflowPdf,
    getActiveWorkflowRuns,
    getWorkflowRunById,
    getWorkflowRunHistory,
    getWorkflowStageHistory,
    validateWorkflowBulkUpload,
    downloadFailedWorkflowRows
} from "../controllers/workflow.controller.js";

import {
    authenticate,
    authorize
} from "../middleware/auth.middleware.js";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

router.post(
    "/",
    authenticate,
    authorize("admin"),
    createWorkflow
);

router.post(
    "/runs",
    authenticate,
    createWorkflowRun
);

router.post(
    "/bulk/validate",
    authenticate,
    upload.single("file"),
    validateWorkflowBulkUpload
);

router.get(
    "/bulk/validation/:validationId/failed",
    authenticate,
    downloadFailedWorkflowRows
);

router.get(
    "/runs/history",
    authenticate,
    getWorkflowRunHistory
);

router.get(
    "/runs/:id/history",
    authenticate,
    getWorkflowStageHistory
);

router.get(
    "/runs/:id",
    authenticate,
    getWorkflowRunById
);

router.post(
    "/runs/:id/stages",
    authenticate,
    submitWorkflowStage
);

router.get(
    "/",
    authenticate,
    getAllWorkflows
);

router.get(
    "/runs",
    authenticate,
    getActiveWorkflowRuns
);

router.get(
    "/runs/:id/pdf",
    authenticate,
    downloadWorkflowPdf
);

router.get(
    "/:id",
    authenticate,
    getWorkflowById
);

router.use(
    (
        error,
        req,
        res,
        next
    ) => {
        if (
            error instanceof multer.MulterError &&
            error.code === "LIMIT_FILE_SIZE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "File size cannot exceed 10 MB."
            });
        }

        next(error);
    }
);

export default router;