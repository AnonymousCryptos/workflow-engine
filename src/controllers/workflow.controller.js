import { createWorkflowService, 
    getAllWorkflowsService, 
    createWorkflowRunService, 
    getWorkflowByIdService   } from "../services/workflow.service.js";

import { generateWorkflowPdf } from "../services/workflowPdf.service.js";

export async function createWorkflow(req, res) {
    try {
        const workflowId = await createWorkflowService(req.body);

        res.status(201).json({
            success: true,
            workflowId
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getAllWorkflows(req, res) {
    try {
        const workflows = await getAllWorkflowsService();

        res.json({
            success: true,
            data: workflows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export async function createWorkflowRun(req, res) {
    try {
        const { workflowId, stageData } = req.body;

        const result = await createWorkflowRunService({
            workflowId,
            stageData
        });

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

export async function getWorkflowById(req, res) {
    try {
        const { id } = req.params;

        const workflow = await getWorkflowByIdService(id);

        res.json({
            success: true,
            data: workflow
        });
    } catch (error) {
        console.error(error);

        res.status(404).json({
            success: false,
            message: error.message
        });
    }
}

export async function downloadWorkflowPdf(req, res) {
    try {
        const { id } = req.params;

        const pdf = await generateWorkflowPdf(id);

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="workflow-${id}.pdf"`
        );

        res.send(pdf);
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}