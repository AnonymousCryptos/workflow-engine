import {
    createWorkflow,
    getAllWorkflows,
    getWorkflowById
} from "../database/workflow.repository.js";

import { createWorkflowRun } from "../database/workflowRun.repository.js";


function validateFields(fields, scope = "fields") {
    if (!Array.isArray(fields)) {
        throw new Error(`${scope} must be an array`);
    }

    const keys = new Set();

    for (const field of fields) {
        if (!field || typeof field !== "object" || Array.isArray(field)) {
            throw new Error(`Invalid field definition in ${scope}`);
        }

        if (
            typeof field.key !== "string" ||
            field.key.trim() === ""
        ) {
            throw new Error(
                `Every field in ${scope} must have a key`
            );
        }

        if (keys.has(field.key)) {
            throw new Error(
                `Duplicate field key "${field.key}" in ${scope}`
            );
        }

        keys.add(field.key);

        if (
            typeof field.label !== "string" ||
            field.label.trim() === ""
        ) {
            throw new Error(
                `Field "${field.key}" must have a label`
            );
        }

        if (
            typeof field.dataType !== "string" ||
            field.dataType.trim() === ""
        ) {
            throw new Error(
                `Field "${field.key}" must have a dataType`
            );
        }

        if (
            typeof field.component !== "string" ||
            field.component.trim() === ""
        ) {
            throw new Error(
                `Field "${field.key}" must have a component`
            );
        }

        if (field.dataType === "array") {
            if (field.component !== "array") {
                throw new Error(
                    `Array field "${field.key}" must use component "array"`
                );
            }

            if (!Object.prototype.hasOwnProperty.call(field, "fields")) {
                throw new Error(
                    `Array field "${field.key}" must contain a "fields" property`
                );
            }

            if (!Array.isArray(field.fields)) {
                throw new Error(
                    `The "fields" property of array field "${field.key}" must be an array`
                );
            }

            if (field.fields.length === 0) {
                throw new Error(
                    `Array field "${field.key}" must contain at least one field`
                );
            }

            validateFields(
                field.fields,
                `fields of "${field.key}"`
            );
        }
    }
}


function validateWorkflow(workflow) {
    if (!workflow || typeof workflow !== "object") {
        throw new Error("Workflow data is required");
    }

    if (
        typeof workflow.name !== "string" ||
        workflow.name.trim() === ""
    ) {
        throw new Error("Workflow name is required");
    }

    if (
        !Array.isArray(workflow.stages) ||
        workflow.stages.length === 0
    ) {
        throw new Error(
            "Workflow must contain at least one stage"
        );
    }

    const stageIds = new Set();

    for (const stage of workflow.stages) {
        if (
            !stage ||
            typeof stage !== "object" ||
            Array.isArray(stage)
        ) {
            throw new Error("Invalid stage definition");
        }

        if (
            stage.id === undefined ||
            stage.id === null ||
            stage.id === ""
        ) {
            throw new Error("Every stage must have an id");
        }

        if (stageIds.has(stage.id)) {
            throw new Error(
                `Duplicate stage id "${stage.id}"`
            );
        }

        stageIds.add(stage.id);

        if (
            typeof stage.name !== "string" ||
            stage.name.trim() === ""
        ) {
            throw new Error(
                `Stage "${stage.id}" must have a name`
            );
        }

        if (!Array.isArray(stage.fields)) {
            throw new Error(
                `Stage "${stage.name}" must contain a fields array`
            );
        }

        validateFields(
            stage.fields,
            `fields of stage "${stage.name}"`
        );
    }
}


export async function createWorkflowService(workflow) {
    validateWorkflow(workflow);

    const workflowId = await createWorkflow(workflow);

    return workflowId;
}


export async function getAllWorkflowsService() {
    return await getAllWorkflows();
}


export async function createWorkflowRunService({
    workflowId,
    stageData
}) {
    if (!workflowId) {
        throw new Error("Workflow ID is required");
    }

    if (
        !stageData ||
        typeof stageData !== "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error("Stage data is required");
    }

    const workflow = await getWorkflowById(workflowId);

    if (!workflow) {
        throw new Error("Workflow not found");
    }

    if (!workflow.isActive) {
        throw new Error("Workflow is inactive");
    }

    if (
        !Array.isArray(workflow.stages) ||
        workflow.stages.length === 0
    ) {
        throw new Error("Workflow has no stages");
    }

    const firstStage = workflow.stages[0];

    if (!firstStage.id) {
        throw new Error("First stage ID is required");
    }

    if (workflow.stages.length < 2) {
        throw new Error(
            "Workflow must contain at least two stages"
        );
    }

    const nextStage = workflow.stages[1];

    const referenceId = `WF-${Date.now()}`;

    const workflowRunId = await createWorkflowRun({
        referenceId,
        workflowId,
        currentStageId: nextStage.id,
        activeStageData: {},
        stageId: firstStage.id,
        stageData,
        remark: stageData.remark || null
    });

    return {
        workflowRunId,
        referenceId,
        currentStageId: nextStage.id
    };
}


export async function getWorkflowByIdService(workflowId) {
    const workflow = await getWorkflowById(workflowId);

    if (!workflow) {
        throw new Error("Workflow not found");
    }

    return workflow;
}