import { getPool } from "../config/database.js";

export async function createWorkflowRun({
    referenceId,
    workflowId,
    currentStageId,
    activeStageData,
    stageId,
    stageData,
    remark
}) {
    const pool = getPool();

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [runResult] = await connection.query(
            `
            INSERT INTO workflow_runs
            (
                reference_id,
                workflow_id,
                status,
                current_stage_id,
                active_stage_data
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                referenceId,
                workflowId,
                "running",
                currentStageId,
                JSON.stringify(activeStageData)
            ]
        );

        const workflowRunId = runResult.insertId;

        await connection.query(
            `
            INSERT INTO workflow_stage_history
            (
                workflow_run_id,
                stage_id,
                stage_data,
                remark,
                completed_at
            )
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `,
            [
                workflowRunId,
                stageId,
                JSON.stringify(stageData),
                remark || null
            ]
        );

        await connection.commit();

        return workflowRunId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getWorkflowRunForPdf(workflowRunId) {
    const pool = getPool();

    const [rows] = await pool.query(
        `
        SELECT
            wr.id,
            wr.reference_id,
            wr.workflow_id,
            wr.status,
            wr.created_at,
            wsh.stage_data
        FROM workflow_runs wr
        INNER JOIN workflow_stage_history wsh
            ON wsh.workflow_run_id = wr.id
        WHERE wr.id = ?
        ORDER BY wsh.id ASC
        LIMIT 1
        `,
        [workflowRunId]
    );

    if (rows.length === 0) {
        return null;
    }

    return {
        id: rows[0].id,
        referenceId: rows[0].reference_id,
        workflowId: rows[0].workflow_id,
        status: rows[0].status,
        createdAt: rows[0].created_at,
        stageData: rows[0].stage_data
    };
}

export async function getSkuDetailsForPdf(skuNames) {
    if (!Array.isArray(skuNames) || skuNames.length === 0) {
        return [];
    }

    const pool = getPool();

    const placeholders = skuNames
        .map(() => "?")
        .join(", ");

    const [rows] = await pool.query(
        `
        SELECT
            sku_name,
            image_url
        FROM sku_details
        WHERE sku_name IN (${placeholders})
          AND is_active = 1
        `,
        skuNames
    );

    return rows;
}