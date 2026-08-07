import { createWorkflow, getAllWorkflows } from "../database/workflow.repository.js";

export async function createWorkflowService(workflow) {
    if (!workflow.name) {
        throw new Error("Workflow name is required");
    }

    if (!Array.isArray(workflow.stages) || workflow.stages.length === 0) {
        throw new Error("Workflow must contain at least one stage");
    }

    const workflowId = await createWorkflow(workflow);

    return workflowId;
}

export async function getAllWorkflowsService() {
    return await getAllWorkflows();
}