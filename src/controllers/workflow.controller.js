import { createWorkflowService, getAllWorkflowsService  } from "../services/workflow.service.js";

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